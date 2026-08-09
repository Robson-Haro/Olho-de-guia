export type EvidenceStatus = "confirmed" | "unconfirmed" | "failed";

export type CandidateEvidence = {
  criterion: "role" | "seniority" | "required" | "leadership" | "complexity" | "geography";
  label: string;
  status: EvidenceStatus;
  score: number;
  maxScore: number;
  evidence: string;
};

export type EvidenceAssessmentInput = {
  jobTitle: string;
  candidateTitle: string;
  candidateText: string;
  requiredConcepts: Array<{ label: string; aliases: string[] }>;
  geographicMatch: "city" | "subdivision" | "country" | "targeted" | "unknown";
  geographicLabel?: string;
};

export type EvidenceAssessment = {
  eligible: boolean;
  score: number;
  classification: "high" | "validate" | "expansion" | "rejected";
  rejectionReasons: string[];
  evidence: CandidateEvidence[];
};

const SENIORITY: Array<{ rank: number; terms: string[] }> = [
  { rank: 8, terms: ["chief", "ceo", "cfo", "coo", "chro", "c-level", "presidente"] },
  { rank: 7, terms: ["vice president", "vp", "diretor", "diretora", "director"] },
  { rank: 6, terms: ["gerente executivo", "executive manager", "head", "gerente senior", "senior manager", "gerente", "manager"] },
  { rank: 5, terms: ["coordenador", "coordenadora", "coordinator", "lead"] },
  { rank: 4, terms: ["supervisor", "supervisora"] },
  { rank: 3, terms: ["especialista", "specialist", "consultor", "consultant"] },
  { rank: 2, terms: ["analista", "analyst"] },
  { rank: 1, terms: ["assistente", "assistant", "auxiliar", "estagiario", "intern"] },
];

const LEADERSHIP_SIGNALS = [
  "lideranca", "liderando", "liderar", "leading", "leadership", "gestao de equipe",
  "team management", "responsavel pela area", "head of", "diretos", "direct reports",
];

const COMPLEXITY_SIGNALS = [
  "global", "latam", "america latina", "regional", "multinacional", "multinational",
  "multiple countries", "varios paises", "executive compensation", "remuneracao executiva",
  "long term incentive", "lti", "mercer", "korn ferry", "hay group", "job evaluation",
];

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "para", "com", "the", "of", "and",
  "senior", "senior", "executivo", "executiva", "executive", "gerente", "manager",
  "head", "diretor", "director",
]);

export function normalizeEvidenceText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function contains(text: string, term: string) {
  return normalizeEvidenceText(text).includes(normalizeEvidenceText(term));
}

function seniorityRank(value: string) {
  const normalized = normalizeEvidenceText(value);
  return SENIORITY.find((level) => level.terms.some((term) => normalized.includes(term)))?.rank || 0;
}

function roleTokens(value: string) {
  return [...new Set(
    normalizeEvidenceText(value)
      .replace(/[^a-z0-9+# ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP.has(token)),
  )];
}

function excerpt(text: string, term: string) {
  const normalized = normalizeEvidenceText(text);
  const index = normalized.indexOf(normalizeEvidenceText(term));
  if (index < 0) return "";
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + term.length + 75);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function signalEvidence(text: string, signals: string[]) {
  const signal = signals.find((item) => contains(text, item));
  return signal ? excerpt(text, signal) : "";
}

export function assessCandidateEvidence(input: EvidenceAssessmentInput): EvidenceAssessment {
  const candidateText = [input.candidateTitle, input.candidateText].filter(Boolean).join(" · ");
  const jobTokens = roleTokens(input.jobTitle);
  const matchedRoleTokens = jobTokens.filter((token) => contains(input.candidateTitle, token));
  const roleCoverage = jobTokens.length ? matchedRoleTokens.length / jobTokens.length : 0;
  const roleScore = Math.round(25 * roleCoverage);

  const jobRank = seniorityRank(input.jobTitle);
  const candidateRank = seniorityRank(input.candidateTitle);
  const seniorityDistance = jobRank && candidateRank ? Math.abs(jobRank - candidateRank) : 99;
  const seniorityScore = !jobRank ? 10 : seniorityDistance === 0 ? 20 : seniorityDistance === 1 ? 12 : 0;

  const requiredMatches = input.requiredConcepts.map((concept) => {
    const alias = concept.aliases.find((item) => contains(candidateText, item));
    return { ...concept, alias, excerpt: alias ? excerpt(candidateText, alias) : "" };
  });
  const requiredConfirmed = requiredMatches.filter((item) => item.alias);
  const requiredScore = input.requiredConcepts.length
    ? Math.round(25 * requiredConfirmed.length / input.requiredConcepts.length)
    : 12;

  const leadershipExcerpt = signalEvidence(candidateText, LEADERSHIP_SIGNALS);
  const leadershipRequired = jobRank >= 6;
  const leadershipScore = leadershipExcerpt ? 10 : leadershipRequired ? 0 : 5;
  const complexityExcerpt = signalEvidence(candidateText, COMPLEXITY_SIGNALS);
  const complexityScore = complexityExcerpt ? 10 : 0;
  const geographyScore = input.geographicMatch === "city"
    ? 10
    : input.geographicMatch === "subdivision"
      ? 8
      : input.geographicMatch === "country"
        ? 5
        : 0;

  const rejectionReasons: string[] = [];
  if (roleCoverage < 0.5) rejectionReasons.push("cargo funcional incompatível com a vaga");
  if (jobRank >= 6 && candidateRank > 0 && candidateRank < 6) {
    rejectionReasons.push("senioridade atual abaixo de gerente/head");
  }
  if (jobRank >= 7 && candidateRank > 0 && candidateRank < 6) {
    rejectionReasons.push("senioridade atual incompatível com posição executiva");
  }

  const explicitlyDivergent = normalizeEvidenceText(input.geographicLabel || "").includes("divergente");
  if (explicitlyDivergent) rejectionReasons.push("localização atual explicitamente fora do escopo");

  const eligible = rejectionReasons.length === 0;
  const rawScore = Math.min(100, roleScore + seniorityScore + requiredScore + leadershipScore + complexityScore + geographyScore);
  const score = eligible ? rawScore : Math.min(rawScore, 54);
  const classification = !eligible
    ? "rejected"
    : score >= 85
      ? "high"
      : score >= 70
        ? "validate"
        : "expansion";

  const requiredEvidence = input.requiredConcepts.length
    ? requiredMatches.map((item) => item.alias
      ? `${item.label}: ${item.excerpt || item.alias}`
      : `${item.label}: não confirmado no trecho público`).join(" | ")
    : "nenhum conceito obrigatório estruturado";

  return {
    eligible,
    score,
    classification,
    rejectionReasons,
    evidence: [
      {
        criterion: "role",
        label: "Aderência funcional",
        status: roleCoverage >= 0.75 ? "confirmed" : roleCoverage >= 0.5 ? "unconfirmed" : "failed",
        score: roleScore,
        maxScore: 25,
        evidence: matchedRoleTokens.length ? `Termos do cargo: ${matchedRoleTokens.join(", ")}` : "sem evidência do cargo correto",
      },
      {
        criterion: "seniority",
        label: "Senioridade atual",
        status: seniorityScore >= 12 ? "confirmed" : candidateRank ? "failed" : "unconfirmed",
        score: seniorityScore,
        maxScore: 20,
        evidence: candidateRank ? input.candidateTitle : "senioridade não confirmada",
      },
      {
        criterion: "required",
        label: "Critérios obrigatórios",
        status: !input.requiredConcepts.length || requiredConfirmed.length === input.requiredConcepts.length
          ? "confirmed"
          : requiredConfirmed.length ? "unconfirmed" : "failed",
        score: requiredScore,
        maxScore: 25,
        evidence: requiredEvidence,
      },
      {
        criterion: "leadership",
        label: "Liderança da função",
        status: leadershipExcerpt ? "confirmed" : leadershipRequired ? "unconfirmed" : "confirmed",
        score: leadershipScore,
        maxScore: 10,
        evidence: leadershipExcerpt || "liderança não confirmada no trecho público",
      },
      {
        criterion: "complexity",
        label: "Complexidade e abrangência",
        status: complexityExcerpt ? "confirmed" : "unconfirmed",
        score: complexityScore,
        maxScore: 10,
        evidence: complexityExcerpt || "abrangência não confirmada no trecho público",
      },
      {
        criterion: "geography",
        label: "Localização atual",
        status: geographyScore >= 8 ? "confirmed" : explicitlyDivergent ? "failed" : "unconfirmed",
        score: geographyScore,
        maxScore: 10,
        evidence: input.geographicLabel || "localização não confirmada",
      },
    ],
  };
}
