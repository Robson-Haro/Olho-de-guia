"use client";
import { useEffect, useState } from "react";
import { COUNTRY_OPTIONS, findCountryCode, geographicLocationLabel, getCountryProfile } from "@/lib/geography";
import { MARKET_SEGMENTS } from "@/lib/market-segments";
import {
  Bird,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Crosshair,
  Database,
  Download,
  Eye,
  EyeOff,
  Home,
  ListChecks,
  MapPinned,
  LockKeyhole,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  Zap,
} from "lucide-react";

type ImportedJob = {
  id: string;
  code: string;
  title: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  description: string;
  responsibilities: string;
  prerequisites: string;
  additionalInformation: string;
  department: string;
  role: string;
  status: string;
};

type SearchStrategy = {
  label: string;
  query: string;
  url: string;
};

type Candidate = {
  id: string;
  name: string;
  title: string;
  city: string;
  state: string;
  country: string;
  profileUrl?: string;
  company?: string;
  source?: string;
  summary?: string;
  compatibility: number;
  matchReason: string;
  rank?: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  matchedRequiredKeywords?: string[];
  missingRequiredKeywords?: string[];
  titleAlignment?: string;
  evidenceConfidence?: number;
  evidenceLabel?: string;
  rankingEngine?: string;
  geographicMatch?: "city" | "subdivision" | "country" | "targeted" | "unknown";
  geographicLabel?: string;
  searchedLocations?: string[];
  tier?: "A" | "B" | "C";
  tierLabel?: string;
  seniorityLabel?: string;
  gender?: {
    value: "feminino" | "masculino" | "indeterminado";
    confidence: number;
    source: string;
    basis: string;
  };
  memoryNotes?: string[];
  aiVerdict?: { veredito: "forte" | "provavel" | "fraco"; nota: number; justificativa: string; evidencia: string };
  scoreBreakdown?: {
    cargo: number;
    senioridade: number;
    competencias: number;
    localidade: number;
    ruido: number;
    evidencia?: number;
    segmento?: number;
    memoria?: number;
  };
};

type RoleMemoryView = {
  roleKey: string;
  roleLabel?: string;
  active?: boolean;
  searchCount: number;
  approvedCount: number;
  discardedCount: number;
  hiredCount: number;
  confirmedTitles?: Array<{ title: string; approvals: number }>;
  confirmedTerms?: Array<{ term: string; approvals: number }>;
  companies?: Array<{ company: string; approvals: number }>;
  demotedTitles?: string[];
  learnedTitles?: string[];
  learnedTerms?: string[];
  learnedCompanies?: string[];
};

type AiReadingView = {
  configured: boolean;
  applied: boolean;
  notes: string;
  addedTerms: number;
  costUsd: number;
};

type GenderKey = "" | "feminino" | "masculino";

type GenderAudit = {
  key: GenderKey;
  matched: number;
  opposite: number;
  unidentified: number;
  includeUnknown: boolean;
};

type JobForm = {
  title: string;
  marketSegment: string;
  countryCode: string;
  subdivision: string;
  cityCount: number;
  cities: string[];
  description: string;
  keywords: string[];
  countrywide: boolean;
  /** Chave de gênero para sourcing de diversidade. Vazio = desligada. */
  genderKey: GenderKey;
  /** Mantém na lista quem o sistema não conseguiu identificar. */
  includeUnknownGender: boolean;
};

const GENDER_OPTIONS: Array<{ value: GenderKey; label: string }> = [
  { value: "", label: "Todos os gêneros (chave desligada)" },
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
];

type JobIntelligence = {
  family?: string | null;
  familyLabel: string;
  level?: string | null;
  equivalentTitles: string[];
  skills: string[];
  requiredKeywords?: Array<{ label: string; aliases: string[] }>;
  /** Núcleo funcional da vaga em PT/EN/ES, produzido pelo léxico. */
  roleCore?: string[];
  /** Conceitos de domínio da vaga, cada um com os seus sinônimos. */
  domainConcepts?: string[][];
  /** Termos de hierarquia da vaga nos três idiomas. */
  levelTerms?: string[];
  languages: string[];
};

type ProviderSearchStatus = {
  provider: "serper";
  label: string;
  status: "success" | "error";
  count: number;
  queries: number;
  message: string;
  poolSize?: number;
  elapsedMs?: number;
  tiers?: { A: number; B: number; C: number };
  mappedCompanies?: string[];
  genderAudit?: GenderAudit;
};

type TalentSourceStatus = {
  provider: "serper";
  label: string;
  configured: boolean;
  updatedAt: string | null;
};

type IntegrationState = {
  status: "idle" | "working" | "success" | "error";
  message: string;
};

const nav = [
  { icon: Home, label: "Visão geral" },
  { icon: BriefcaseBusiness, label: "Vagas" },
  { icon: Crosshair, label: "Nova busca" },
  { icon: UsersRound, label: "Candidatos" },
  { icon: ListChecks, label: "Shortlist" },
  { icon: Database, label: "Banco de talentos" },
  { icon: Settings, label: "Configurações", admin: true },
];

const candidateLimitOptions = Array.from({ length: 20 }, (_, index) => index + 1);
const cityCountOptions = Array.from({ length: 20 }, (_, index) => index + 1);

export default function HomePage() {
  const [active, setActive] = useState("Visão geral"),
    [jobCode, setJobCode] = useState(""),
    [candidateLimit, setCandidateLimit] = useState(20),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  const [importedJob, setImportedJob] = useState<ImportedJob | null>(null);
  const [jobEntryMode, setJobEntryMode] = useState<"gupy" | "manual">("gupy");
  const [jobForm, setJobForm] = useState<JobForm>({
    title: "",
    marketSegment: "",
    countryCode: "BR",
    subdivision: "",
    cityCount: 1,
    cities: [""],
    description: "",
    keywords: ["", "", "", ""],
    countrywide: false,
    genderKey: "",
    includeUnknownGender: false,
  });
  const [genderAudit, setGenderAudit] = useState<GenderAudit | null>(null);
  const [aiReading, setAiReading] = useState<AiReadingView | null>(null);
  const [roleMemory, setRoleMemory] = useState<RoleMemoryView | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "aprovado" | "descartado" | "contratado">>({});
  const [decisionBusy, setDecisionBusy] = useState("");
  const [expansionCount, setExpansionCount] = useState(0);
  const [searchStatus, setSearchStatus] = useState<"idle" | "working" | "completed" | "empty" | "error">("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchStrategies, setSearchStrategies] = useState<SearchStrategy[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobIntelligence, setJobIntelligence] = useState<JobIntelligence | null>(null);
  const [pythonRankingActive, setPythonRankingActive] = useState(false);
  const [pythonEvaluatedCount, setPythonEvaluatedCount] = useState(0);
  const [exportStatus, setExportStatus] = useState<"idle" | "working" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [providerResults, setProviderResults] = useState<ProviderSearchStatus[]>([]);
  const [selectedSubdivision, setSelectedSubdivision] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [gupyToken, setGupyToken] = useState(""),
    [showToken, setShowToken] = useState(false),
    [configStatus, setConfigStatus] = useState<
      "idle" | "working" | "success" | "error"
    >("idle"),
    [configMessage, setConfigMessage] = useState("");
  const [talentKeys, setTalentKeys] = useState({ serper: "" });
  // Senha administrativa exigida pelas rotas de gravação de credenciais. Fica
  // apenas na aba aberta (sessionStorage): nunca vai para o banco, e some ao
  // fechar o navegador.
  const [adminKey, setAdminKey] = useState("");
  const [adminKeyConfigured, setAdminKeyConfigured] = useState(true);
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [showTalentKeys, setShowTalentKeys] = useState({ serper: false });
  const [talentSourceStatus, setTalentSourceStatus] = useState<TalentSourceStatus[]>([]);
  const [talentIntegration, setTalentIntegration] = useState<Record<"serper", IntegrationState>>({
    serper: { status: "idle", message: "" },
  });
  const selectedCountryProfile = getCountryProfile(jobForm.countryCode);
  const highAdherenceCount = candidates.filter((candidate) => candidate.compatibility >= 70 && candidate.tier !== "C").length;
  const stats = [
    { label: "Perfis mapeados", value: String(candidates.length), icon: UsersRound },
    { label: "Alta aderência", value: String(highAdherenceCount), icon: Target },
    { label: "Shortlists ativas", value: "0", icon: ListChecks },
    { label: "Tempo economizado", value: "0h", icon: Zap },
  ];
  useEffect(() => {
    if (active !== "Configurações") return;
    fetch("/api/admin/talent-source", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao consultar fontes.");
        setTalentSourceStatus(Array.isArray(data.sources) ? data.sources : []);
        setAdminKeyConfigured(data.adminKeyConfigured !== false);
        setAdminKey((current) => current || sessionStorage.getItem("eureka_admin_key") || "");
      })
      .catch(() => setTalentSourceStatus([]));
  }, [active]);
  async function importJob() {
    if (!jobCode.trim()) {
      setMessage("Digite o código da vaga.");
      return;
    }
    setLoading(true);
    setMessage("");
    setImportedJob(null);
    try {
      const response = await fetch(`/api/gupy/jobs/${jobCode.trim()}`),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível importar a vaga.");
      setImportedJob(data.job);
      const importedCountryCode = findCountryCode(data.job.countryCode || data.job.country, "BR");
      setJobForm((current) => ({
        ...current,
        title: data.job.title || "",
        countryCode: importedCountryCode,
        subdivision: data.job.state || "",
        cityCount: 1,
        cities: [data.job.city || ""],
        countrywide: false,
        description: [
          data.job.description,
          data.job.responsibilities,
          data.job.prerequisites,
          data.job.additionalInformation,
        ].filter(Boolean).join("\n\n"),
      }));
      setMessage(`Vaga ${data.job.title} importada com sucesso.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Erro ao importar vaga.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function configure(action: "test" | "save") {
    if (!gupyToken) {
      setConfigStatus("error");
      setConfigMessage("Cole o token da Gupy para continuar.");
      return;
    }
    setConfigStatus("working");
    setConfigMessage(
      action === "save"
        ? "Validando e protegendo o token..."
        : "Testando conexão com a Gupy...",
    );
    try {
      const response = await fetch("/api/admin/gupy-token", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-eureka-admin-key": adminKey },
          body: JSON.stringify({ token: gupyToken, action }),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na configuração.");
      setConfigStatus("success");
      setConfigMessage(data.message);
      if (action === "save") setGupyToken("");
    } catch (error) {
      setConfigStatus("error");
      setConfigMessage(
        error instanceof Error
          ? error.message
          : "Erro ao configurar integração.",
      );
    }
  }
  async function configureTalentSource(provider: "serper", action: "test" | "save") {
    const apiKey = talentKeys[provider].trim();
    if (!apiKey) {
      setTalentIntegration((current) => ({ ...current, [provider]: { status: "error", message: "Cole a chave da API para continuar." } }));
      return;
    }
    setTalentIntegration((current) => ({ ...current, [provider]: { status: "working", message: action === "save" ? "Testando e protegendo a chave..." : "Testando conexão..." } }));
    try {
      const response = await fetch("/api/admin/talent-source", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-eureka-admin-key": adminKey },
        body: JSON.stringify({ provider, apiKey, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na configuração.");
      setTalentIntegration((current) => ({ ...current, [provider]: { status: "success", message: data.message } }));
      if (adminKey) sessionStorage.setItem("eureka_admin_key", adminKey);
      if (action === "save") {
        setTalentKeys((current) => ({ ...current, [provider]: "" }));
        const statusResponse = await fetch("/api/admin/talent-source", { cache: "no-store" });
        const statusData = await statusResponse.json();
        if (statusResponse.ok) setTalentSourceStatus(Array.isArray(statusData.sources) ? statusData.sources : []);
      }
    } catch (error) {
      setTalentIntegration((current) => ({ ...current, [provider]: { status: "error", message: error instanceof Error ? error.message : "Erro na configuração." } }));
    }
  }
  function updateKeyword(index: number, value: string) {
    setJobForm((current) => ({
      ...current,
      keywords: current.keywords.map((keyword, keywordIndex) => keywordIndex === index ? value : keyword),
    }));
  }
  function updateCity(index: number, value: string) {
    setJobForm((current) => ({
      ...current,
      cities: current.cities.map((city, cityIndex) => cityIndex === index ? value : city),
    }));
  }
  function updateCityCount(value: number) {
    const cityCount = Math.min(20, Math.max(1, value));
    setJobForm((current) => ({
      ...current,
      cityCount,
      cities: Array.from({ length: cityCount }, (_, index) => current.cities[index] || ""),
    }));
  }
  function changeCountry(countryCode: string) {
    setJobForm((current) => ({
      ...current,
      countryCode,
      subdivision: "",
      cityCount: 1,
      cities: [""],
      countrywide: false,
    }));
  }
  function prepareManualJob() {
    setImportedJob(null);
    setJobForm({ title: "", marketSegment: "", countryCode: "BR", subdivision: "", cityCount: 1, cities: [""], description: "", keywords: ["", "", "", ""], countrywide: false, genderKey: "", includeUnknownGender: false });
    setMessage("Preencha os dados abaixo e inicie a busca.");
    setSearchStatus("idle");
    setSearchStrategies([]);
    setProviderResults([]);
    setJobIntelligence(null);
    setPythonRankingActive(false);
    setPythonEvaluatedCount(0);
    setGenderAudit(null);
    setExpansionCount(0);
  }

  async function registerDecision(candidate: Candidate, decision: "aprovado" | "descartado" | "contratado") {
    if (!roleMemory?.roleKey || !candidate.profileUrl) return;
    setDecisionBusy(candidate.id);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleKey: roleMemory.roleKey,
          roleLabel: jobForm.title,
          profileUrl: candidate.profileUrl,
          candidateTitle: candidate.title,
          company: candidate.company,
          summary: candidate.summary,
          decision,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao registrar.");
      setDecisions((current) => ({ ...current, [candidate.id]: decision }));
      // A memória volta atualizada na mesma chamada: o recrutador vê o efeito
      // da própria decisão em vez de alimentar uma caixa-preta.
      if (data.memory) setRoleMemory((current) => ({ ...(current || {}), ...data.memory }));
    } catch {
      setDecisionBusy("");
    } finally {
      setDecisionBusy("");
    }
  }

  async function requestPythonIntelligence(job: typeof jobForm, profiles: Candidate[] = [], mappedCompanies: string[] = [], vocabulary: Record<string, unknown> = {}) {
    const profile = getCountryProfile(job.countryCode);
    const normalizedJob = {
      ...job,
      country: profile.name,
      city: job.cities[0] || "",
      additionalCity: job.cities.slice(1).join(", "),
      nationwide: job.countrywide,
      mappedCompanies,
      // Vocabulário ampliado pela leitura e pela memória. Sem repassá-lo, a
      // busca encontraria o perfil em inglês e o ranking o descartaria por não
      // reconhecer o termo — a dupla eliminação de volta, com outro nome.
      ...vocabulary,
    };
    const response = await fetch("/svc/intelligence/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: normalizedJob, candidates: profiles }),
    });
    if (!response.ok) throw new Error("Motor Python temporariamente indisponível.");
    return response.json();
  }

  async function startSearch() {
    const selectedCities = jobForm.cities.map((city) => city.trim()).filter(Boolean);
    if (!jobForm.title.trim() || !jobForm.description.trim() || (!jobForm.countrywide && !selectedCities.length)) {
      setSearchStatus("error");
      setSearchMessage("Preencha o título, a descrição, o país e ao menos uma cidade antes de buscar.");
      return;
    }
    setSearchStatus("working");
    setSearchMessage("Interpretando a vaga em português, inglês e espanhol...");
    setProviderResults([]);
    setCandidates([]);
    setJobIntelligence(null);
    setPythonRankingActive(false);
    setPythonEvaluatedCount(0);
    setGenderAudit(null);
    setExpansionCount(0);
    setAiReading(null);
    setRoleMemory(null);
    setDecisions({});
    setExportMessage("");
    try {
      let enrichedSearch = {
        ...jobForm,
        country: selectedCountryProfile.name,
        cities: selectedCities,
      } as typeof jobForm & { country: string } & {
        titleVariants?: string[];
        semanticKeywords?: string[];
        requiredKeywordConcepts?: Array<{ label: string; aliases: string[] }>;
        roleCore?: string[];
        domainConcepts?: string[][];
        levelTerms?: string[];
      };
      let pythonPrepared = false;
      let resolvedJobIntelligence: JobIntelligence | null = null;
      try {
        const intelligenceData = await requestPythonIntelligence(jobForm);
        const intelligence = intelligenceData.jobIntelligence as JobIntelligence;
        resolvedJobIntelligence = intelligence;
        setJobIntelligence(intelligence);
        enrichedSearch = {
          ...jobForm,
          country: selectedCountryProfile.name,
          cities: selectedCities,
          titleVariants: intelligence?.equivalentTitles || [],
          semanticKeywords: intelligence?.skills || [],
          requiredKeywordConcepts: intelligence?.requiredKeywords || [],
          // Núcleo funcional e conceitos de domínio traduzidos pelo léxico. É o
          // que faz a camada de busca decidir sobre o mesmo vocabulário do
          // motor de ranking, em vez de manter uma lista própria.
          roleCore: intelligence?.roleCore || [],
          domainConcepts: intelligence?.domainConcepts || [],
          levelTerms: intelligence?.levelTerms || [],
        };
        pythonPrepared = true;
        setSearchMessage("Cargos equivalentes identificados. Consultando perfis públicos do LinkedIn...");
      } catch {
        throw new Error("O motor de leitura e senioridade está indisponível. A busca foi interrompida para não exibir candidatos sem validação.");
      }
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...enrichedSearch, maxCandidates: candidateLimit }),
      });
      const data = await response.json();
      setSearchStrategies(Array.isArray(data.strategies) ? data.strategies : []);
      setProviderResults(Array.isArray(data.providers) ? data.providers : []);
      setGenderAudit(data.genderAudit || null);
      setAiReading(data.aiReading || null);
      setRoleMemory(data.memory || null);
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a busca.");
      const foundCandidates = Array.isArray(data.candidates) ? data.candidates as Candidate[] : [];
      // O Python precisa reavaliar o conjunto amplo encontrado pelo Serper,
      // e não somente os perfis que o TypeScript já colocaria na lista final.
      const evaluationPool = Array.isArray(data.pool) && data.pool.length
        ? (data.pool as Candidate[])
        : foundCandidates;
      let rankedCandidates = foundCandidates;
      // Quantos perfis o motor avaliou e reprovou. Serve para explicar uma
      // busca sem aprovados em vez de exibir apenas "0 perfis".
      let expansionTotal = 0;
      if (evaluationPool.length && pythonPrepared) {
        try {
          setSearchMessage(`Reavaliando ${evaluationPool.length} perfis pelo motor Python multilíngue...`);
          const mappedCompanies = Array.isArray(data.mappedCompanies) ? data.mappedCompanies : [];
          const rankingData = await requestPythonIntelligence(jobForm, evaluationPool, mappedCompanies, {
            roleCoreExtra: data.vocabulary?.roleCore || [],
            domainConceptsExtra: data.vocabulary?.domainConcepts || [],
            titleVariantsExtra: data.vocabulary?.titleVariants || [],
            learnedTitles: data.memory?.learnedTitles || [],
            learnedTerms: data.memory?.learnedTerms || [],
          });
          if (Array.isArray(rankingData.candidates)) {
            rankedCandidates = rankingData.candidates.slice(0, candidateLimit);
            setPythonRankingActive(true);
            setPythonEvaluatedCount(evaluationPool.length);
            expansionTotal = Number(rankingData.expansionCount) || 0;
            setExpansionCount(expansionTotal);
            if (rankingData.jobIntelligence) {
              resolvedJobIntelligence = rankingData.jobIntelligence;
              setJobIntelligence(rankingData.jobIntelligence);
            }
          }
        } catch {
          setPythonRankingActive(false);
          setPythonEvaluatedCount(0);
          throw new Error("Os perfis foram encontrados, mas o motor de aderência não conseguiu validá-los. Nenhum candidato foi exibido.");
        }
      }
      // ETAPA DE PARECER. Só recebe quem as regras JÁ aprovaram: o modelo pode
      // confirmar, rebaixar ou recomendar descarte, nunca promover um perfil
      // reprovado. Falha aqui não interrompe nada — a lista determinística
      // continua sendo exibida.
      let reviewed = rankedCandidates;
      if (rankedCandidates.length && data.aiReading?.configured) {
        try {
          setSearchMessage(`Lendo os ${Math.min(rankedCandidates.length, 25)} perfis do topo e escrevendo o parecer de cada um...`);
          const reviewResponse = await fetch("/api/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: jobForm.title,
              description: jobForm.description,
              candidates: rankedCandidates.slice(0, 25).map((candidate) => ({
                id: candidate.id,
                title: candidate.title,
                company: candidate.company,
                summary: candidate.summary,
                city: candidate.city,
                state: candidate.state,
              })),
            }),
          });
          const reviewData = await reviewResponse.json();
          if (reviewResponse.ok && Array.isArray(reviewData.verdicts) && reviewData.verdicts.length) {
            const byId = new Map<string, Candidate["aiVerdict"]>(
              reviewData.verdicts.map((verdict: NonNullable<Candidate["aiVerdict"]> & { id: string }) => [verdict.id, verdict]),
            );
            reviewed = rankedCandidates.map((candidate) => {
              const verdict = byId.get(candidate.id);
              if (!verdict) return candidate;
              // O parecer pesa 35% e só reordena. Um veredito "fraco" derruba o
              // perfil para o fim da lista, mas ele continua visível: o
              // recrutador precisa poder discordar do modelo.
              const blended = Math.round(candidate.compatibility * 0.65 + verdict.nota * 0.35);
              return {
                ...candidate,
                aiVerdict: verdict,
                compatibility: verdict.veredito === "fraco" ? Math.min(blended, 44) : blended,
              };
            }).sort((left, right) => right.compatibility - left.compatibility);
          }
        } catch {
          // parecer é opcional por desenho
        }
      }
      rankedCandidates = reviewed;

      const queriesUsed = Array.isArray(data.providers)
        ? data.providers.reduce((total: number, provider: ProviderSearchStatus) => total + (Number(provider.queries) || 0), 0)
        : 0;
      const limitedCandidates = rankedCandidates.slice(0, candidateLimit);
      const evaluatedProfiles = Math.max(Number(data.evaluated) || 0, evaluationPool.length);
      const requiredKeywordCount = resolvedJobIntelligence?.requiredKeywords?.length
        ?? jobForm.keywords.filter((keyword) => keyword.trim()).length;
      setCandidates(limitedCandidates);
      setSelectedSubdivision(limitedCandidates[0]?.state || (limitedCandidates.length ? "Região não identificada" : ""));
      setSelectedCity("");
      setSearchStatus(limitedCandidates.length ? "completed" : "empty");
      setSearchMessage(limitedCandidates.length
        ? `Busca concluída: ${evaluatedProfiles} perfil(is) público(s) avaliados em ${queriesUsed} consulta(s) e ${limitedCandidates.length} selecionado(s)${requiredKeywordCount ? ` com ${requiredKeywordCount} critério(s) prioritário(s)` : ""}${pythonPrepared ? ", cargos equivalentes em três idiomas" : ""}${limitedCandidates[0]?.rankingEngine ? " e ranking Python confirmado" : ""}.`
        : `A busca executou ${queriesUsed} consulta(s) e não aprovou nenhum perfil.${
            data.genderAudit
              ? ` A chave de gênero (${data.genderAudit.key}) separou ${data.genderAudit.opposite} perfil(is) de gênero divergente e ${data.genderAudit.unidentified} sem identificação — considere marcar "manter perfis não identificados".`
              : ""
          }${
            Number(expansionTotal) > 0
              ? ` ${expansionTotal} perfil(is) foram avaliados e reprovados; o motivo de cada reprovação está registrado na auditoria.`
              : ""
          } Revise o título, os critérios prioritários ou amplie a localização.`);
      localStorage.setItem("eureka_active_search", JSON.stringify({ ...jobForm, country: selectedCountryProfile.name, cities: selectedCities, maxCandidates: candidateLimit, strategies: data.strategies, candidates: limitedCandidates, providers: data.providers, jobIntelligence: resolvedJobIntelligence, mappedCompanies: data.mappedCompanies || [], createdAt: new Date().toISOString() }));
    } catch (error) {
      setSearchStatus("error");
      setSearchMessage(error instanceof Error ? error.message : "Erro ao iniciar busca.");
    }
  }

  async function downloadCandidateSpreadsheet() {
    if (!candidates.length) return;
    setExportStatus("working");
    setExportMessage("");
    try {
      const response = await fetch("/svc/intelligence/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: jobForm, candidates }),
      });
      if (!response.ok) throw new Error("Não foi possível gerar a planilha Excel.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = jobForm.title.replace(/[^a-zA-Z0-9À-ÿ_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "candidatos";
      anchor.href = url;
      anchor.download = `Eureka-${safeTitle}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportStatus("idle");
      setExportMessage(`Planilha com ${candidates.length} candidato(s) baixada com sucesso.`);
    } catch (error) {
      setExportStatus("error");
      setExportMessage(error instanceof Error ? error.message : "Falha ao baixar a planilha.");
    }
  }
  const subdivisionTotals = candidates.reduce<Record<string, number>>((totals, candidate) => {
    const subdivision = candidate.state || "Região não identificada";
    totals[subdivision] = (totals[subdivision] || 0) + 1;
    return totals;
  }, {});
  const selectedSubdivisionCandidates = candidates.filter((candidate) => (candidate.state || "Região não identificada") === selectedSubdivision);
  const cityTotals = selectedSubdivisionCandidates.reduce<Record<string, number>>((totals, candidate) => {
    const city = candidate.city || "Cidade não identificada";
    totals[city] = (totals[city] || 0) + 1;
    return totals;
  }, {});
  const visibleCandidates = selectedCity
    ? selectedSubdivisionCandidates.filter((candidate) => (candidate.city || "Cidade não identificada") === selectedCity)
    : selectedSubdivisionCandidates;
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandmark">
            <Bird size={30} />
          </div>
          <div>
            <strong>EUREKA</strong>
            <span>TALENT HUNTER</span>
          </div>
        </div>
        <nav>
          {nav.map(({ icon: Icon, label, admin }) => (
            <button
              key={label}
              onClick={() => setActive(label)}
              className={active === label ? "active" : ""}
            >
              <Icon size={19} />
              <span>{label}</span>
              {admin && <span className="admin">ADMIN</span>}
            </button>
          ))}
        </nav>
        <div className="navBottom">
          <a href="https://robinho-minerva-foods1-muen.vercel.app/">
            <Home size={18} /> HOME
          </a>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">CENTRAL DE INTELIGÊNCIA</p>
            <h1>{active}</h1>
            <p>Encontre os talentos certos antes da concorrência.</p>
          </div>
          <div className="headerActions">
            <a
              className="homeShortcut"
              href="https://robinho-minerva-foods1-muen.vercel.app/"
              aria-label="Voltar para o Ecossistema de Talent Acquisition Estratégico"
            >
              <Home size={18} />
              <span>HOME</span>
            </a>
            {active !== "Configurações" && (
              <button
                className="configShortcut"
                onClick={() => setActive("Configurações")}
              >
                <Settings size={18} />
                <span>CONFIGURAR GUPY</span>
              </button>
            )}
            <div className="profile">
              <div className="statusDot" />
              <div>
                <strong>Usuário</strong>
                <span>Sistema Eureka</span>
              </div>
              <CircleUserRound size={36} />
            </div>
          </div>
        </header>
        {active === "Configurações" ? (
          <section className="settingsView">
            <article className="glass settingsCard">
              <div className="sectionTitle">
                <div>
                  <span className="kicker">
                    ACESSO EXCLUSIVO DO ADMINISTRADOR
                  </span>
                  <h2>Integração Gupy</h2>
                </div>
                <div
                  className={`connectionIcon ${configStatus === "success" ? "connected" : ""}`}
                >
                  <ShieldCheck size={30} />
                </div>
              </div>
              <p>
                Cadastre o token uma única vez. As analistas informarão apenas o
                código da vaga e nunca terão acesso à credencial.
              </p>
              <div className="securityBanner">
                <LockKeyhole size={21} />
                <div>
                  <strong>Token protegido</strong>
                  <span>Criptografia AES-256 no banco de dados.</span>
                </div>
              </div>
              <label>
                <span>Token da API Gupy</span>
                <div className="secureInput">
                  <ShieldCheck size={18} />
                  <input
                    type={showToken ? "text" : "password"}
                    value={gupyToken}
                    onChange={(e) => setGupyToken(e.target.value)}
                    placeholder="Cole o token aqui"
                    autoComplete="off"
                  />
                  <button
                    onClick={() => setShowToken(!showToken)}
                    aria-label="Mostrar ou ocultar token"
                  >
                    {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small>O token não volta a ser exibido depois de salvo.</small>
              </label>
              {configMessage && (
                <div className={`configNotice ${configStatus}`}>
                  {configStatus === "success" ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <ShieldCheck size={18} />
                  )}
                  <span>{configMessage}</span>
                </div>
              )}
              <div className="configActions">
                <button
                  className="secondary"
                  disabled={configStatus === "working"}
                  onClick={() => configure("test")}
                >
                  TESTAR CONEXÃO
                </button>
                <button
                  className={`primary ${configStatus === "success" ? "saved" : ""}`}
                  disabled={configStatus === "working"}
                  onClick={() => configure("save")}
                >
                  <ShieldCheck size={18} />
                  {configStatus === "working"
                    ? "PROCESSANDO..."
                    : configStatus === "success"
                      ? "CONFIGURAÇÃO ATIVA"
                      : "SALVAR CONFIGURAÇÃO"}
                </button>
              </div>
            </article>
            <article className="glass settingsCard talentSourcesCard">
              <div className="sectionTitle">
                <div>
                  <span className="kicker">BUSCA AUTOMÁTICA REAL</span>
                  <h2>Fontes de talentos</h2>
                </div>
                <Database size={30} />
              </div>
              <p>
                Conecte o Serper para localizar perfis públicos do LinkedIn pelo
                Google. A chave é criptografada e usada apenas no servidor.
              </p>
              <label className="adminKeyField">
                <span>Senha administrativa</span>
                <div className="secureInput">
                  <ShieldCheck size={18} />
                  <input
                    type={showAdminKey ? "text" : "password"}
                    value={adminKey}
                    onChange={(event) => setAdminKey(event.target.value)}
                    placeholder="Exigida para gravar chaves e tokens"
                    autoComplete="off"
                  />
                  <button onClick={() => setShowAdminKey((current) => !current)} aria-label="Mostrar ou ocultar senha administrativa">
                    {showAdminKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small className={adminKeyConfigured ? "adminKeyNote" : "adminKeyNote adminKeyPending"}>
                  {adminKeyConfigured
                    ? "Sem esta senha, qualquer pessoa com o endereço do sistema poderia sobrescrever a chave do Serper e o token da Gupy. Ela fica só nesta aba do navegador."
                    : "Ainda não há senha definida no servidor: a gravação de credenciais está bloqueada. Crie a variável de ambiente EUREKA_ADMIN_KEY na Vercel, com 16 caracteres ou mais, e recarregue esta página."}
                </small>
              </label>
              <div className="talentSourceList">
                {(["serper"] as const).map((provider) => {
                  const configured = talentSourceStatus.find((source) => source.provider === provider)?.configured;
                  const integration = talentIntegration[provider];
                  const label = "Serper · Busca LinkedIn";
                  return (
                    <section className="talentSource" key={provider}>
                      <div className="sourceHeading">
                        <div>
                          <strong>{label}</strong>
                          <span>Perfis públicos do LinkedIn indexados pelo Google</span>
                        </div>
                        <span className={`sourceBadge ${configured ? "connected" : ""}`}>
                          {configured ? "CONECTADA" : "NÃO CONFIGURADA"}
                        </span>
                      </div>
                      <label>
                        <span>Chave da API</span>
                        <div className="secureInput">
                          <ShieldCheck size={18} />
                          <input
                            type={showTalentKeys[provider] ? "text" : "password"}
                            value={talentKeys[provider]}
                            onChange={(event) => setTalentKeys((current) => ({ ...current, [provider]: event.target.value }))}
                            placeholder={`Cole a chave ${label}`}
                            autoComplete="off"
                          />
                          <button
                            onClick={() => setShowTalentKeys((current) => ({ ...current, [provider]: !current[provider] }))}
                            aria-label="Mostrar ou ocultar chave"
                          >
                            {showTalentKeys[provider] ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                      <small className="creditNote">
                        Cada teste usa 1 crédito. Cada busca usa até 12 créditos: são 6 consultas de 100 resultados, e no Serper uma consulta de 100 resultados custa 2 créditos — cinco vezes mais barato por perfil do que pedir 10. A conta nova inclui 2.500 créditos gratuitos, sem cartão. Nenhum enriquecimento é realizado.
                      </small>
                      <a className="providerHelpLink" href="https://serper.dev/" target="_blank" rel="noreferrer">
                        Criar conta ou consultar saldo no Serper
                      </a>
                      {integration.message && (
                        <div className={`configNotice ${integration.status}`}>
                          {integration.status === "success" ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                          <span>{integration.message}</span>
                        </div>
                      )}
                      <div className="configActions compactActions">
                        <button className="secondary" disabled={integration.status === "working"} onClick={() => configureTalentSource(provider, "test")}>TESTAR</button>
                        <button className={`primary ${configured ? "saved" : ""}`} disabled={integration.status === "working"} onClick={() => configureTalentSource(provider, "save")}>
                          <ShieldCheck size={18} />
                          {integration.status === "working" ? "PROCESSANDO..." : configured ? "ATUALIZAR CONEXÃO" : "SALVAR E ATIVAR"}
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
            </article>
            <aside className="glass setupGuide">
              <span className="kicker">STATUS DA INTEGRAÇÃO</span>
              <h3>Como funciona</h3>
              <ol>
                <li>
                  <b>Você</b> cadastra a chave do Serper nesta área protegida.
                </li>
                <li>
                  <b>O sistema</b> testa a conexão antes de salvar.
                </li>
                <li>
                  <b>As analistas</b> inserem somente o código da vaga.
                </li>
                <li>
                  <b>O agente</b> importa a vaga da Gupy, monta a busca X-Ray e consulta perfis públicos do LinkedIn.
                </li>
              </ol>
              <div className="privateBadge">
                <LockKeyhole size={17} /> Credencial nunca enviada ao navegador
                das analistas
              </div>
            </aside>
          </section>
        ) : (
          <>
            <section className="hero metallic-card">
              <div className="heroCopy">
                <span className="badge">
                  <Sparkles size={14} /> HUNTING INTELIGENTE
                </span>
                <h2>
                  Transforme uma vaga em uma{" "}
                  <em>estratégia de busca completa.</em>
                </h2>
                <p>
                  O agente expande títulos, competências, empresas e regiões,
                  cria buscas Boolean e X-Ray e ranqueia cada perfil com
                  evidências.
                </p>
                <button
                  className="primary"
                  onClick={() => setActive("Nova busca")}
                >
                  <Crosshair size={18} /> INICIAR NOVA BUSCA{" "}
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="radar">
                <div className="orbit o1" />
                <div className="orbit o2" />
                <div className="orbit o3" />
                <div className="eagle">
                  <Bird size={54} />
                </div>
                <i className="point p1" />
                <i className="point p2" />
                <i className="point p3" />
              </div>
            </section>
            <section className="stats">
              {stats.map(({ label, value, icon: Icon }) => (
                <article className="glass" key={label}>
                  <div className="icon">
                    <Icon size={21} />
                  </div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </section>
            <section className="grid">
              <article className="glass import">
                <div className="sectionTitle">
                  <div>
                    <span className="kicker">NOVA VAGA</span>
                    <h3>Como deseja inserir?</h3>
                  </div>
                  <ShieldCheck size={24} />
                </div>
                <div className="entryTabs topEntryTabs">
                  <button className={jobEntryMode === "gupy" ? "active" : ""} onClick={() => { setJobEntryMode("gupy"); setMessage(""); }}>USAR CÓDIGO DA GUPY</button>
                  <button className={jobEntryMode === "manual" ? "active" : ""} onClick={() => { setJobEntryMode("manual"); prepareManualJob(); }}>INSERIR MANUALMENTE</button>
                </div>
                <div className={`jobInput topJobInput ${jobEntryMode === "manual" ? "manualLimit" : ""}`}>
                  {jobEntryMode === "gupy" && (
                    <label className="jobCodeField">
                      <span>Número ou código da vaga Gupy *</span>
                      <input value={jobCode} onChange={(e) => setJobCode(e.target.value)} placeholder="Ex.: 12345678" inputMode="numeric" />
                    </label>
                  )}
                  <label className="candidateLimitField">
                    <span>Quantidade de candidatos</span>
                    <select
                      value={candidateLimit}
                      onChange={(event) => setCandidateLimit(Number(event.target.value))}
                      aria-label="Quantidade máxima de candidatos"
                    >
                      {candidateLimitOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  {jobEntryMode === "gupy" && (
                    <button onClick={importJob} disabled={loading}>{loading ? "PUXANDO..." : "PUXAR VAGA"} <Search size={17} /></button>
                  )}
                </div>
                <div className="searchForm">
                  <label><span>Título da vaga *</span><input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} placeholder="Ex.: Analista de Logística" /></label>
                  <label><span>Segmento de mercado</span><select value={jobForm.marketSegment} onChange={(e) => setJobForm({ ...jobForm, marketSegment: e.target.value })} aria-label="Segmento de mercado">{MARKET_SEGMENTS.map((segment) => <option key={segment.value || "all"} value={segment.value}>{segment.label}</option>)}</select><small>Quando selecionado, o Eureka mapeia empresas do segmento no Google antes de procurar profissionais.</small></label>
                  <label className="full"><span>Descrição da vaga — revise e altere como desejar *</span><textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} placeholder="A descrição importada aparecerá aqui, ou você pode escrever manualmente" rows={9} /></label>
                  <fieldset className="full keywordFields"><legend>Palavras-chave obrigatórias para a busca</legend>
                    {jobForm.keywords.map((keyword, index) => <input key={index} value={keyword} onChange={(e) => updateKeyword(index, e.target.value)} placeholder={`Palavra-chave ${index + 1}`} />)}
                    <small className="keywordHint">Cada campo vira um critério prioritário. O Eureka aceita equivalentes em português, inglês e espanhol e sinaliza quando a evidência pública precisa ser confirmada no LinkedIn.</small>
                  </fieldset>
                  <section className="full genderKeyPanel" aria-labelledby="gender-key-title">
                    <div className="genderKeyHeader">
                      <div>
                        <span className="kicker">CHAVE DE GÊNERO · SOURCING DE DIVERSIDADE</span>
                        <h4 id="gender-key-title">Recortar a busca por gênero?</h4>
                      </div>
                      <UsersRound size={26} />
                    </div>
                    <div className="genderKeyControls">
                      <label>
                        <span>Gênero da busca</span>
                        <select
                          value={jobForm.genderKey}
                          onChange={(event) => setJobForm({ ...jobForm, genderKey: event.target.value as GenderKey })}
                          aria-label="Chave de gênero da busca"
                        >
                          {GENDER_OPTIONS.map((option) => (
                            <option key={option.value || "todos"} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      {jobForm.genderKey && (
                        <label className="genderUnknownToggle">
                          <input
                            type="checkbox"
                            checked={jobForm.includeUnknownGender}
                            onChange={(event) => setJobForm({ ...jobForm, includeUnknownGender: event.target.checked })}
                          />
                          <span>
                            <strong>Manter perfis não identificados</strong>
                            <small>
                              Prenomes usados por homens e mulheres — Alex, Ariel, Darci — e cargos neutros como
                              Gerente ou Analista não permitem conclusão. Sem esta opção, esses perfis ficam de fora
                              mesmo quando pertencem ao gênero procurado.
                            </small>
                          </span>
                        </label>
                      )}
                    </div>
                    {jobForm.genderKey ? (
                      <div className="genderKeyNotice">
                        <ShieldCheck size={17} />
                        <span>
                          A chave altera as consultas ao Google — cargo flexionado e pronome declarado no perfil — e
                          exibe apenas perfis com gênero identificado como <strong>{jobForm.genderKey}</strong>.
                          A inferência usa somente pronome declarado, forma do cargo e prenome, é probabilística e
                          não soma nem subtrai pontos de aderência. Todo perfil separado fica registrado na auditoria
                          e na planilha. A decisão final continua humana.
                        </span>
                      </div>
                    ) : (
                      <small className="genderKeyHint">
                        Desligada: nenhuma inferência de gênero é executada, gravada ou exportada.
                      </small>
                    )}
                  </section>
                  <section className="full geographyBuilder" aria-labelledby="geography-title">
                    <div className="geographyHeader">
                      <div>
                        <span className="kicker">INTELIGÊNCIA GEOGRÁFICA</span>
                        <h4 id="geography-title">Onde o Eureka deve procurar?</h4>
                      </div>
                      <MapPinned size={27} />
                    </div>
                    <div className="geographyControls">
                      <label>
                        <span>País *</span>
                        <select value={jobForm.countryCode} onChange={(event) => changeCountry(event.target.value)} aria-label="País da busca">
                          {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>{selectedCountryProfile.subdivisionLabel}</span>
                        <input value={jobForm.subdivision} onChange={(event) => setJobForm({ ...jobForm, subdivision: event.target.value })} placeholder={`Ex.: ${selectedCountryProfile.subdivisionLabel}`} disabled={jobForm.countrywide} />
                      </label>
                      <label className="cityQuantityField">
                        <span>Quantidade de cidades</span>
                        <select value={jobForm.cityCount} onChange={(event) => updateCityCount(Number(event.target.value))} disabled={jobForm.countrywide} aria-label="Quantidade de cidades da busca">
                          {cityCountOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                    </div>
                    {!jobForm.countrywide && <div className="cityFieldsGrid">
                      {jobForm.cities.map((city, index) => (
                        <label key={index}>
                          <span>Cidade {index + 1} {index === 0 ? "*" : ""}</span>
                          <input value={city} onChange={(event) => updateCity(index, event.target.value)} placeholder={index === 0 ? "Cidade principal ou importada" : `Nome da cidade ${index + 1}`} />
                        </label>
                      ))}
                    </div>}
                    <label className="countrywideToggle">
                      <input type="checkbox" checked={jobForm.countrywide} onChange={(event) => setJobForm({ ...jobForm, countrywide: event.target.checked })} />
                      <span><strong>Todo o país — todas as cidades</strong><small>Mapear profissionais em qualquer localidade de {selectedCountryProfile.name}.</small></span>
                    </label>
                    <div className="geographyScope"><MapPinned size={18} /><span><strong>Área selecionada:</strong> {geographicLocationLabel(jobForm) || selectedCountryProfile.name}</span></div>
                  </section>
                  <button className={`primary full searchButton ${searchStatus === "completed" ? "activated" : ""} ${searchStatus === "empty" ? "finishedEmpty" : ""}`} onClick={startSearch} disabled={searchStatus === "working"}>
                    {searchStatus === "completed" ? <CheckCircle2 size={21} /> : <Crosshair size={21} />}
                    {searchStatus === "working" ? "BUSCANDO TALENTOS..." : searchStatus === "completed" ? `BUSCA CONCLUÍDA · ${candidates.length} PERFIS` : searchStatus === "empty" ? "BUSCA FINALIZADA · 0 PERFIS" : "INICIAR BUSCA DE TALENTOS"}
                  </button>
                  {searchMessage && <div className={`searchSignal full ${searchStatus}`}><span className="signalDot" />{searchMessage}</div>}
                  {providerResults.length > 0 && <div className="providerRunList full">
                    {providerResults.map((provider) => <div key={provider.provider} className={provider.status}>
                      <span className="signalDot" />
                      <strong>{provider.label}</strong>
                      <span>{provider.message}</span>
                    </div>)}
                  </div>}
                  {providerResults.some((provider) => provider.mappedCompanies?.length) && <div className="geographyScope full"><Database size={18} /><span><strong>Empresas do segmento mapeadas:</strong> {providerResults.flatMap((provider) => provider.mappedCompanies || []).join(" · ")}</span></div>}
                  {genderAudit && <div className="geographyScope full genderAuditBar">
                    <UsersRound size={18} />
                    <span>
                      <strong>Auditoria da chave de gênero ({genderAudit.key}):</strong>{" "}
                      {genderAudit.matched} perfil(is) confirmado(s) · {genderAudit.opposite} de gênero divergente ·{" "}
                      {genderAudit.unidentified} sem identificação{genderAudit.includeUnknown ? " (mantidos na lista)" : " (separados da lista)"}.
                      {!genderAudit.includeUnknown && genderAudit.unidentified > 0 && " Marque \"manter perfis não identificados\" para reavaliá-los."}
                    </span>
                  </div>}
                  {expansionCount > 0 && candidates.length === 0 && <div className="geographyScope full">
                    <ShieldCheck size={18} />
                    <span><strong>{expansionCount} perfil(is) avaliados e reprovados.</strong> O motor registrou o motivo de cada reprovação — cargo, senioridade, critérios obrigatórios ou geografia.</span>
                  </div>}
                </div>
                {message && <div className="notice">{message}</div>}
                <div className="safe">
                  <ShieldCheck size={16} /> Até {candidateLimit} candidatos por busca · o Eureka avalia um conjunto amplo antes de selecionar os melhores · chave protegida no servidor
                </div>
              </article>
              <article className="glass results">
                <div className="sectionTitle">
                  <div>
                    <span className="kicker">RADAR DE TALENTOS</span>
                    <h3>Perfis públicos encontrados</h3>
                    {jobIntelligence && <p className="intelligenceSummary">Família identificada: <strong>{jobIntelligence.familyLabel}</strong> · {jobIntelligence.equivalentTitles.length} cargo(s) equivalente(s){jobIntelligence.requiredKeywords?.length ? ` · ${jobIntelligence.requiredKeywords.length} palavra(s)-chave obrigatória(s)` : ""} · PT/EN/ES</p>}
                  </div>
                  {candidates.length > 0 && <div className="resultActions">
                    {pythonRankingActive && <span className="pythonBadge">PYTHON ATIVO · {pythonEvaluatedCount} PERFIS REAVALIADOS</span>}
                    <button className="exportButton" onClick={downloadCandidateSpreadsheet} disabled={exportStatus === "working"}>
                      <Download size={17} /> {exportStatus === "working" ? "GERANDO EXCEL..." : "BAIXAR PLANILHA"}
                    </button>
                  </div>}
                </div>
                {exportMessage && <div className={`exportNotice ${exportStatus === "error" ? "error" : "success"}`}>{exportMessage}</div>}
                {candidates.length > 0 ? <div className="candidateTableWrap">
                  <table className="candidateTable">
                    <thead>
                      <tr>
                        <th>Aderência</th>
                        <th>Nome</th>
                        <th>Cargo atual</th>
                        <th>Empresa</th>
                        <th>Localização</th>
                        <th>LinkedIn</th>
                        <th>Decisão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((candidate) => (
                        <tr key={candidate.id}>
                          <td>
                            <span className={`compatibilityBadge ${candidate.compatibility >= 70 ? "high" : candidate.compatibility >= 45 ? "medium" : "low"}`}>
                              {candidate.compatibility}%
                            </span>
                            {candidate.tier && <span className={`candidateTier tier${candidate.tier}`} title={candidate.tierLabel}>
                              {candidate.tier === "A" ? "EVIDÊNCIA COMPLETA" : candidate.tier === "B" ? "EVIDÊNCIA PARCIAL" : "CONFIRMAR NO PERFIL"}
                            </span>}
                            <small className="matchReason">{candidate.matchReason}</small>
                            {candidate.scoreBreakdown && <small className="scoreBreakdown">
                              Cargo {candidate.scoreBreakdown.cargo} · Senioridade {candidate.scoreBreakdown.senioridade} · Competências {candidate.scoreBreakdown.competencias} · Localidade {candidate.scoreBreakdown.localidade}{candidate.scoreBreakdown.segmento ? ` · Segmento ${candidate.scoreBreakdown.segmento}` : ""}{candidate.scoreBreakdown.ruido ? ` · Ruído ${candidate.scoreBreakdown.ruido}` : ""}{candidate.scoreBreakdown.evidencia ? ` · Ajuste de evidência ${candidate.scoreBreakdown.evidencia}` : ""}
                            </small>}
                            {candidate.evidenceLabel && <small className="evidenceConfidence">Confiança das evidências: {candidate.evidenceLabel}</small>}
                            {candidate.aiVerdict && <div className={`aiVerdict ${candidate.aiVerdict.veredito}`}>
                              <strong>{candidate.aiVerdict.veredito === "forte" ? "PARECER: FORTE" : candidate.aiVerdict.veredito === "provavel" ? "PARECER: PROVÁVEL" : "PARECER: FRACO"}</strong>
                              <span>{candidate.aiVerdict.justificativa}</span>
                              {candidate.aiVerdict.evidencia && <em>{candidate.aiVerdict.evidencia}</em>}
                            </div>}
                            {candidate.memoryNotes?.length ? <small className="memoryNote">{candidate.memoryNotes.join(" · ")}</small> : null}
                          </td>
                          <td>
                            <strong>{candidate.name}</strong>
                            {candidate.gender && candidate.gender.value !== "indeterminado" && (
                              <small className={`genderTag ${candidate.gender.value}`} title={candidate.gender.basis}>
                                {candidate.gender.value} · {candidate.gender.confidence}%
                              </small>
                            )}
                            {candidate.summary && <small className="candidateSnippet">{candidate.summary}</small>}
                          </td>
                          <td>{candidate.title || "Não identificado"}</td>
                          <td>{candidate.company || "Não identificada"}</td>
                          <td>
                            {[candidate.city, candidate.state, candidate.country].filter(Boolean).join(" · ") || "Não identificada"}
                            {candidate.geographicLabel && <small className="geoEvidence">{candidate.geographicLabel}</small>}
                          </td>
                          <td>
                            <a className="linkedinButton" href={candidate.profileUrl} target="_blank" rel="noreferrer">
                              ABRIR PERFIL <ChevronRight size={15} />
                            </a>
                          </td>
                          <td>
                            {roleMemory?.roleKey ? (
                              decisions[candidate.id] ? (
                                <span className={`decisionTag ${decisions[candidate.id]}`}>
                                  {decisions[candidate.id] === "aprovado" ? "APROVADO" : decisions[candidate.id] === "contratado" ? "CONTRATADO" : "DESCARTADO"}
                                </span>
                              ) : (
                                <div className="decisionButtons">
                                  <button
                                    className="approve"
                                    disabled={decisionBusy === candidate.id}
                                    onClick={() => registerDecision(candidate, "aprovado")}
                                  >Aprovar</button>
                                  <button
                                    className="discard"
                                    disabled={decisionBusy === candidate.id}
                                    onClick={() => registerDecision(candidate, "descartado")}
                                  >Descartar</button>
                                </div>
                              )
                            ) : <small className="decisionOff">memória desligada</small>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(aiReading || roleMemory) && <div className="learningPanel">
                    <div className="learningHead">
                      <Sparkles size={16} />
                      <strong>O que o Eureka usou nesta busca</strong>
                    </div>
                    <div className="learningGrid">
                      <div>
                        <span className="learningLabel">Leitura da vaga</span>
                        {!aiReading?.configured
                          ? <p>Desligada. Configure <code>EUREKA_LLM_API_KEY</code> para o modelo ampliar o vocabulário de busca sozinho.</p>
                          : aiReading.applied
                            ? <p>Ativa — acrescentou {aiReading.addedTerms} termo(s) de mercado ao vocabulário do léxico.{aiReading.notes ? ` ${aiReading.notes}` : ""} Custo desta leitura: US$ {aiReading.costUsd.toFixed(4)}.</p>
                            : <p>Configurada, mas não respondeu nesta busca. A lista seguiu pelo vocabulário do léxico, sem prejuízo.</p>}
                      </div>
                      <div>
                        <span className="learningLabel">Memória desta família de vaga</span>
                        {!roleMemory
                          ? <p>Desligada. A memória depende do Supabase configurado no servidor.</p>
                          : <p>
                              {roleMemory.searchCount} busca(s) · {roleMemory.approvedCount} aprovado(s) · {roleMemory.hiredCount} contratado(s) · {roleMemory.discardedCount} descartado(s).
                              {roleMemory.active
                                ? " O histórico já influencia as consultas e a ordem da lista."
                                : " Ainda aprendendo: a partir de duas aprovações o histórico passa a influenciar a busca."}
                            </p>}
                        {roleMemory?.learnedTitles?.length ? <p className="learningTerms"><strong>Cargos que já deram certo:</strong> {roleMemory.learnedTitles.join(" · ")}</p> : null}
                        {roleMemory?.learnedCompanies?.length ? <p className="learningTerms"><strong>Empresas de origem:</strong> {roleMemory.learnedCompanies.join(" · ")}</p> : null}
                        {roleMemory?.demotedTitles?.length ? <p className="learningTerms demoted"><strong>Cargos já descartados:</strong> {roleMemory.demotedTitles.join(" · ")}</p> : null}
                      </div>
                    </div>
                    <small>O aprendizado altera quais consultas o Google recebe e a ordem da lista. Ele nunca aprova sozinho um perfil que as regras de aderência reprovaram, e cada linha do que foi aprendido pode ser consultada e apagada.</small>
                  </div>}
                  <p className="scoreDisclaimer">O ranking considera somente informações profissionais da vaga e do trecho público indexado pelo Google. Não usa nem infere idade, raça, deficiência, saúde, religião ou outros atributos pessoais sensíveis.{genderAudit ? " A chave de gênero recorta o conjunto de sourcing e não altera a pontuação de nenhum perfil." : ""} Confirme o perfil completo no LinkedIn: a decisão final deve ser humana.</p>
                </div> : <div className="emptyState"><UsersRound size={38} /><strong>{searchStatus === "working" ? "Busca em andamento" : searchStatus === "empty" ? "Busca finalizada sem perfis" : searchStatus === "error" ? "A busca automática não foi executada" : "Nenhuma busca ativada"}</strong><span>{searchStatus === "error" ? "Confira o aviso e conecte o Serper em Configurações." : "Preencha a vaga e consulte os perfis públicos pelo Serper."}</span></div>}
                {searchStrategies.length > 0 && <div className="manualSearches">
                  <span className="kicker">PESQUISA MANUAL COMPLEMENTAR</span>
                  <div className="strategyList">
                    {searchStrategies.map((strategy) => <a key={strategy.label} href={strategy.url} target="_blank" rel="noreferrer"><div><strong>{strategy.label}</strong><span>{strategy.query}</span></div><ChevronRight size={20} /></a>)}
                  </div>
                </div>}
              </article>
            </section>
            {candidates.length > 0 && (
              <section className="glass geoPanel">
                <div className="sectionTitle"><div><span className="kicker">INTELIGÊNCIA GEOGRÁFICA</span><h3>Mapa hierárquico de talentos</h3><p>{candidates.length} perfis organizados por país, {selectedCountryProfile.subdivisionLabel.toLowerCase()} e cidade.</p></div><MapPinned size={30} /></div>
                <div className="geographyTargetBar">
                  <div className="countryIdentity"><MapPinned size={25}/><span><small>PAÍS DA BUSCA</small><strong>{selectedCountryProfile.name}</strong></span><b>{jobForm.countryCode}</b></div>
                  <div className="targetLocations"><small>LOCALIDADES PESQUISADAS</small><div>{jobForm.countrywide ? <span>Todo o país</span> : jobForm.cities.filter(Boolean).map((city) => <span key={city}>{city}</span>)}</div></div>
                </div>
                <div className="geoGrid">
                  <div className="subdivisionPanel" aria-label={`Perfis por ${selectedCountryProfile.subdivisionLabel.toLowerCase()}`}>
                    <h4>{selectedCountryProfile.subdivisionLabel}</h4>
                    <p>Selecione uma região para abrir suas cidades e profissionais.</p>
                    <div className="subdivisionList">
                      {Object.entries(subdivisionTotals).sort((a, b) => b[1] - a[1]).map(([subdivision, total]) => {
                        const percentage = candidates.length ? Math.round((total / candidates.length) * 100) : 0;
                        return <button key={subdivision} className={selectedSubdivision === subdivision ? "selected" : ""} onClick={() => { setSelectedSubdivision(subdivision); setSelectedCity(""); }}><span><strong>{subdivision}</strong><small>{percentage}% dos perfis</small></span><b>{total}</b></button>;
                      })}
                    </div>
                  </div>
                  <div className="geoDetails">
                    {!selectedSubdivision ? <div className="emptyState"><MapPinned size={38}/><strong>Selecione uma região</strong><span>Abra as cidades e os perfis encontrados sem misturar países.</span></div> : <><h4>{selectedSubdivision} · {selectedSubdivisionCandidates.length} perfis</h4><div className="cityChips">{Object.entries(cityTotals).sort((a, b) => b[1] - a[1]).map(([city,total]) => <button key={city} className={selectedCity === city ? "active" : ""} onClick={() => setSelectedCity(city)}>{city}<span>{total}</span></button>)}</div>{!selectedSubdivisionCandidates.length ? <div className="emptyState compact"><UsersRound size={32}/><strong>Nenhum perfil real nesta região</strong><span>Não serão exibidos dados fictícios.</span></div> : <div className="profileList">{visibleCandidates.map((candidate) => <a key={candidate.id} href={candidate.profileUrl || "#"} target={candidate.profileUrl ? "_blank" : undefined} rel="noreferrer"><CircleUserRound size={30}/><span><strong>{candidate.name}</strong><small>{candidate.title} · {[candidate.city, candidate.state, candidate.country].filter(Boolean).join(" · ") || "localidade a confirmar"}</small></span><ChevronRight size={18}/></a>)}</div>}</>}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
        <footer>
          <span>Eureka · Minerva Talent Intelligence</span>
          <span>
            <span className="live" /> Sistema preparado
          </span>
        </footer>
      </section>
    </main>
  );
}
