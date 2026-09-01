/**
 * Chave de gênero do Eureka — inferência auditável a partir de evidência pública.
 *
 * Regras de uso definidas com a Coordenação Global de Atração e Seleção:
 *  1. A chave é OPCIONAL. Em "Todos os gêneros" nenhuma inferência é executada e
 *     nenhum dado de gênero é gravado, exportado ou enviado ao motor Python.
 *  2. Quando ativada, a inferência usa apenas três evidências públicas, nesta
 *     ordem de prioridade: pronome declarado pelo próprio profissional, forma
 *     gramatical do cargo em português/espanhol e prenome.
 *  3. Toda inferência carrega confiança (0-100) e a base textual que a originou,
 *     para auditoria da busca e defesa do processo seletivo.
 *  4. A chave apoia metas de diversidade na ETAPA DE SOURCING. Não avalia
 *     competência, não pontua o candidato e não substitui a decisão humana.
 */

export type GenderKey = "" | "feminino" | "masculino";
export type GenderValue = "feminino" | "masculino" | "indeterminado";
export type GenderSignalSource = "pronome" | "titulo" | "nome" | "morfologia" | "nenhuma";

export type GenderInference = {
  value: GenderValue;
  confidence: number;
  source: GenderSignalSource;
  basis: string;
};

/** Abaixo deste valor a inferência é tratada como indeterminada. */
export const MIN_GENDER_CONFIDENCE = 60;

const INDETERMINATE: GenderInference = {
  value: "indeterminado",
  confidence: 0,
  source: "nenhuma",
  basis: "sem evidência pública de gênero",
};

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/* ------------------------------------------------------------------ */
/* 1. Pronomes declarados — evidência autodeclarada, a mais confiável   */
/* ------------------------------------------------------------------ */

const FEMININE_PRONOUNS = [
  "ela/dela", "ela / dela", "(ela)", "she/her", "she / her", "(she)",
  "ella/suya", "ella / suya", "(ella)", "elle/delle",
];

const MASCULINE_PRONOUNS = [
  "ele/dele", "ele / dele", "(ele)", "he/him", "he / him", "(he)",
  "el/suyo", "él/suyo", "(el)", "(él)",
];

/* ------------------------------------------------------------------ */
/* 2. Forma gramatical do cargo em PT/ES                                */
/* ------------------------------------------------------------------ */

/**
 * A forma feminina do cargo é uma marcação deliberada: homens não se apresentam
 * como "Coordenadora". Por isso vale confiança alta. Já o masculino é a forma
 * genérica da língua e ainda é usado por parte das profissionais — recebe
 * confiança propositalmente menor.
 */
const FEMININE_TITLE_TERMS = [
  "coordenadora", "coordinadora", "diretora", "directora", "gerenta", "gestora",
  "supervisora", "engenheira", "ingeniera", "consultora", "compradora", "vendedora",
  "operadora", "advogada", "abogada", "psicologa", "contadora", "farmaceutica",
  "veterinaria", "enfermeira", "professora", "secretaria executiva", "assessora",
  "fundadora", "socia", "presidenta", "chefa", "jefa", "recrutadora", "selecionadora",
  "auditora", "controladora", "planejadora", "programadora", "desenvolvedora",
  "administradora", "negociadora", "instrutora", "treinadora", "facilitadora",
  "executiva", "colaboradora", "empreendedora", "redatora", "medica", "quimica",
  "biomedica", "biologa", "geologa", "arquiteta", "sociologa", "pedagoga",
  "estagiaria", "aprendiza", "tecnica", "analista senior mulher", "dra.", "dra ",
];

const MASCULINE_TITLE_TERMS = [
  "coordenador", "coordinador", "diretor", "director", "gestor", "supervisor",
  "engenheiro", "ingeniero", "consultor", "comprador", "vendedor", "operador",
  "advogado", "abogado", "psicologo", "contador", "farmaceutico", "veterinario",
  "enfermeiro", "professor", "assessor", "fundador", "socio", "chefe de",
  "jefe", "recrutador", "auditor", "controlador", "planejador", "programador",
  "desenvolvedor", "administrador", "negociador", "instrutor", "treinador",
  "executivo", "colaborador", "empreendedor", "redator", "medico", "quimico",
  "biomedico", "biologo", "geologo", "arquiteto", "sociologo", "pedagogo",
  "estagiario", "tecnico",
];

/* ------------------------------------------------------------------ */
/* 3. Prenomes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Prenomes que não permitem conclusão. Sob filtro estrito, quem cai nesta lista
 * é separado da lista final — e contabilizado no painel, para que a decisão de
 * incluí-lo seja consciente e não silenciosa.
 */
const AMBIGUOUS_NAMES = new Set([
  "alex", "ariel", "andrea", "cris", "chris", "dani", "dominique", "eden", "eli",
  "jaci", "jean", "jordan", "kim", "lou", "morgan", "nadir", "nikita", "remi",
  "riley", "robin", "sam", "taylor", "darci", "darcy", "iraci", "adair", "ari",
  "sasha", "casey", "avery", "quinn", "reese", "rowan", "sky", "val", "pat",
  "cruz", "guadalupe", "trinidad", "yuri", "noah", "charlie", "frankie", "jamie",
]);

/** Prenomes masculinos terminados em "a" — exceções à regra morfológica. */
const MASCULINE_A_ENDINGS = new Set([
  "luca", "lucca", "joshua", "nicola", "noa", "akira", "mustafa", "hamza",
  "moussa", "elisha", "ezra", "ira", "misha", "ilya", "kolya", "borja", "juca",
  "kenta", "ryota", "obinna", "seneca", "attila", "kafka", "buddha",
]);

/** Prenomes femininos que não terminam em "a". */
const FEMININE_NAMES = new Set([
  "beatriz", "bia", "ester", "esther", "raquel", "rachel", "isabel", "isabelle",
  "ingrid", "karen", "karin", "carmen", "solange", "denise", "elizabeth",
  "elisabeth", "michele", "michelle", "jaqueline", "jacqueline", "adriane",
  "ariane", "luciane", "viviane", "simone", "eliane", "rosane", "cristiane",
  "daiane", "josiane", "fabiane", "juliane", "marlene", "darlene", "charlene",
  "irene", "nadine", "kelly", "shirley", "sueli", "suely", "gisele", "giselle",
  "mabel", "anabel", "maribel", "meire", "elis", "ruth", "judith", "lilian",
  "lillian", "vivian", "marion", "sharon", "joyce", "grace", "jane", "diane",
  "kate", "rose", "hope", "nicole", "adele", "estelle", "danielle", "gabrielle",
  "camille", "noelle", "soledad", "mercedes", "dolores", "pilar", "consuelo",
  "ines", "agnes", "doris", "iris", "luz", "noemi", "naomi", "muriel", "jael",
  "abigail", "gail", "joan", "lynn", "ann", "fern", "dawn", "robyn", "carolyn",
  "marilyn", "evelyn", "jocelyn", "madelyn", "eloise", "heloise", "louise",
  "denyse", "cassiane", "roselaine", "elaine", "germaine", "madeleine", "yasmine",
  "caroline", "pauline", "jasmine", "katherine", "catherine", "christine",
  "josephine", "geraldine", "claudine", "amandine", "cecile", "aline", "aliane",
  "nathalie", "melanie", "stephanie", "valerie", "marie", "sophie", "julie",
  "lucie", "elodie", "amelie", "coralie", "rosemeire", "vanderleia", "sirlei",
  "marlei", "nerci", "ivone", "leone", "sione", "zilde", "matilde", "clotilde",
  "elke", "ute", "birgit", "astrid", "sigrid", "greet", "maeve", "siobhan",
]);

/** Prenomes masculinos frequentes que a morfologia sozinha erraria. */
const MASCULINE_NAMES = new Set([
  "andre", "alexandre", "felipe", "philippe", "guilherme", "vicente", "clemente",
  "vagner", "wagner", "walter", "wilson", "nelson", "edson", "anderson", "emerson",
  "jefferson", "robson", "gilson", "wesley", "washington", "kevin", "steve",
  "mike", "michael", "george", "jorge", "jose", "joao", "luiz", "luis", "carlos",
  "pedro", "paulo", "marcos", "marcelo", "rafael", "gabriel", "daniel", "samuel",
  "manoel", "manuel", "israel", "ismael", "abel", "axel", "noel", "joel",
  "eduardo", "ricardo", "roberto", "alberto", "gilberto", "humberto", "ivan",
  "adrian", "julian", "sebastian", "cristian", "christian", "fabian", "damian",
  "matheus", "mateus", "lucas", "tobias", "elias", "isaias", "jonas", "messias",
  "moises", "andres", "nicolas", "thomas", "douglas", "vinicius", "tadeu",
  "mauricio", "otavio", "octavio", "flavio", "silvio", "helio", "julio", "sergio",
  "rogerio", "valerio", "cesar", "caesar", "oscar", "omar", "elmar", "waldemar",
  "valdemar", "aldair", "adalberto", "clovis", "davi", "david", "levi", "eli hu",
  "henrique", "henry", "harry", "peter", "paul", "james", "john", "robert",
  "william", "richard", "charles", "joseph", "brian", "kenneth", "ronald",
  "anthony", "donald", "edward", "jason", "jeffrey", "gary", "timothy", "larry",
]);

const FEMININE_NAME_PREFIXES = ["maria", "ana", "marta", "julia", "juliana"];

/* ------------------------------------------------------------------ */
/* Núcleo da inferência                                                 */
/* ------------------------------------------------------------------ */

function excerpt(text: string, term: string) {
  const normalizedText = normalize(text);
  const index = normalizedText.indexOf(normalize(term));
  if (index < 0) return term;
  return text.slice(Math.max(0, index - 20), Math.min(text.length, index + term.length + 40))
    .replace(/\s+/g, " ")
    .trim();
}

export function firstName(fullName: string) {
  const cleaned = String(fullName || "")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter((part) => part.replace(/[^\p{L}]/gu, "").length > 1);
  return parts[0] || "";
}

function pronounSignal(text: string): GenderInference | null {
  const normalized = normalize(text);
  const feminine = FEMININE_PRONOUNS.find((pronoun) => normalized.includes(normalize(pronoun)));
  if (feminine) {
    return { value: "feminino", confidence: 98, source: "pronome", basis: `pronome declarado: ${excerpt(text, feminine)}` };
  }
  const masculine = MASCULINE_PRONOUNS.find((pronoun) => normalized.includes(normalize(pronoun)));
  if (masculine) {
    return { value: "masculino", confidence: 98, source: "pronome", basis: `pronome declarado: ${excerpt(text, masculine)}` };
  }
  return null;
}

function titleSignal(title: string): GenderInference | null {
  const normalized = ` ${normalize(title)} `;
  const feminine = FEMININE_TITLE_TERMS.find((term) => normalized.includes(` ${normalize(term)}`));
  if (feminine) {
    return { value: "feminino", confidence: 88, source: "titulo", basis: `cargo na forma feminina: ${feminine.trim()}` };
  }
  const masculine = MASCULINE_TITLE_TERMS.find((term) => normalized.includes(` ${normalize(term)}`));
  if (masculine) {
    // O masculino é a forma genérica da língua; por isso a confiança é menor e
    // pode ser sobreposta por um prenome feminino inequívoco.
    return { value: "masculino", confidence: 62, source: "titulo", basis: `cargo na forma masculina: ${masculine.trim()}` };
  }
  return null;
}

function nameSignal(name: string): GenderInference | null {
  const given = normalize(firstName(name));
  if (!given || given.length < 2) return null;
  if (AMBIGUOUS_NAMES.has(given)) {
    return {
      value: "indeterminado",
      confidence: 0,
      source: "nome",
      basis: `prenome "${firstName(name)}" é usado por homens e mulheres`,
    };
  }
  if (FEMININE_NAMES.has(given)) {
    return { value: "feminino", confidence: 92, source: "nome", basis: `prenome feminino reconhecido: ${firstName(name)}` };
  }
  if (MASCULINE_NAMES.has(given)) {
    return { value: "masculino", confidence: 92, source: "nome", basis: `prenome masculino reconhecido: ${firstName(name)}` };
  }
  if (FEMININE_NAME_PREFIXES.some((prefix) => given === prefix || given.startsWith(`${prefix}-`))) {
    return { value: "feminino", confidence: 92, source: "nome", basis: `prenome feminino reconhecido: ${firstName(name)}` };
  }
  if (MASCULINE_A_ENDINGS.has(given)) {
    return { value: "masculino", confidence: 88, source: "nome", basis: `prenome masculino terminado em "a": ${firstName(name)}` };
  }
  if (given.endsWith("a")) {
    return { value: "feminino", confidence: 72, source: "morfologia", basis: `prenome "${firstName(name)}" segue o padrão feminino em português/espanhol` };
  }
  if (/(?:o|os|son|ton|ilson|inho|ir|or|ar|us|im)$/.test(given)) {
    return { value: "masculino", confidence: 70, source: "morfologia", basis: `prenome "${firstName(name)}" segue o padrão masculino em português/espanhol` };
  }
  return null;
}

/**
 * Combina as três evidências. O pronome declarado sempre vence. Entre cargo e
 * prenome vence a maior confiança; empate resolve pelo prenome, que é o dado
 * mais estável do perfil público.
 */
export function inferGender(input: { name: string; title?: string; text?: string }): GenderInference {
  const fullText = [input.name, input.title, input.text].filter(Boolean).join(" · ");
  const pronoun = pronounSignal(fullText);
  if (pronoun) return pronoun;

  const byName = nameSignal(input.name);
  const byTitle = titleSignal(input.title || "");

  if (byName && byName.confidence >= MIN_GENDER_CONFIDENCE && byTitle) {
    if (byName.value === byTitle.value) {
      return {
        ...byName,
        confidence: Math.min(97, byName.confidence + 6),
        basis: `${byName.basis}; ${byTitle.basis}`,
      };
    }
    // Divergência real entre prenome e cargo: prevalece a evidência mais forte,
    // e o conflito fica registrado para auditoria.
    const winner = byName.confidence >= byTitle.confidence ? byName : byTitle;
    const loser = winner === byName ? byTitle : byName;
    return {
      ...winner,
      confidence: Math.max(MIN_GENDER_CONFIDENCE, winner.confidence - 12),
      basis: `${winner.basis} (evidência divergente: ${loser.basis})`,
    };
  }

  if (byName && byName.confidence >= MIN_GENDER_CONFIDENCE) return byName;
  if (byTitle && byTitle.confidence >= MIN_GENDER_CONFIDENCE) return byTitle;
  if (byName) return byName;
  return INDETERMINATE;
}

/** Verdadeiro quando a inferência satisfaz a chave escolhida na busca. */
export function matchesGenderKey(inference: GenderInference | undefined, key: GenderKey) {
  if (!key) return true;
  if (!inference) return false;
  return inference.value === key && inference.confidence >= MIN_GENDER_CONFIDENCE;
}

export function genderLabel(inference: GenderInference | undefined) {
  if (!inference || inference.value === "indeterminado") return "não identificado";
  return `${inference.value} · ${inference.confidence}% (${inference.source})`;
}

/* ------------------------------------------------------------------ */
/* Expansão de consultas — o ganho real da chave                        */
/* ------------------------------------------------------------------ */

/**
 * Substantivos de cargo com flexão conhecida. A troca é aplicada SOMENTE a estes
 * termos: transformar qualquer palavra terminada em "a" quebraria títulos como
 * "Gerente de Logística" (que viraria "Logístico").
 */
const ROLE_NOUN_FLEXION: Array<{ masculine: string; feminine: string }> = [
  { masculine: "coordenador", feminine: "coordenadora" },
  { masculine: "coordinador", feminine: "coordinadora" },
  { masculine: "diretor", feminine: "diretora" },
  { masculine: "director", feminine: "directora" },
  { masculine: "supervisor", feminine: "supervisora" },
  { masculine: "gestor", feminine: "gestora" },
  { masculine: "engenheiro", feminine: "engenheira" },
  { masculine: "ingeniero", feminine: "ingeniera" },
  { masculine: "consultor", feminine: "consultora" },
  { masculine: "tecnico", feminine: "tecnica" },
  { masculine: "técnico", feminine: "técnica" },
  { masculine: "comprador", feminine: "compradora" },
  { masculine: "vendedor", feminine: "vendedora" },
  { masculine: "operador", feminine: "operadora" },
  { masculine: "auditor", feminine: "auditora" },
  { masculine: "programador", feminine: "programadora" },
  { masculine: "desenvolvedor", feminine: "desenvolvedora" },
  { masculine: "administrador", feminine: "administradora" },
  { masculine: "instrutor", feminine: "instrutora" },
  { masculine: "recrutador", feminine: "recrutadora" },
  { masculine: "estagiario", feminine: "estagiaria" },
  { masculine: "estagiário", feminine: "estagiária" },
  { masculine: "advogado", feminine: "advogada" },
  { masculine: "medico", feminine: "medica" },
  { masculine: "executivo", feminine: "executiva" },
  { masculine: "jefe", feminine: "jefa" },
  { masculine: "socio", feminine: "socia" },
];

/**
 * Devolve o título flexionado para o gênero pedido. Cargos neutros — gerente,
 * analista, especialista, head, manager, lead — voltam inalterados, e por isso
 * a busca por gênero neles depende do pronome declarado.
 */
export function genderedTitle(title: string, key: GenderKey) {
  if (!key) return "";
  const words = String(title || "").split(/(\s+)/);
  let changed = false;
  const converted = words.map((word) => {
    const bare = normalize(word);
    const flexion = ROLE_NOUN_FLEXION.find((item) =>
      bare === normalize(key === "feminino" ? item.masculine : item.feminine),
    );
    if (!flexion) return word;
    changed = true;
    const replacement = key === "feminino" ? flexion.feminine : flexion.masculine;
    return word[0] === word[0]?.toUpperCase()
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
  });
  return changed ? converted.join("") : "";
}

/** Grupo OR de pronomes declarados, pronto para entrar na consulta do Google. */
export function genderPronounExpression(key: GenderKey) {
  if (key === "feminino") return `("Ela/Dela" OR "She/Her" OR "Ella/Suya")`;
  if (key === "masculino") return `("Ele/Dele" OR "He/Him" OR "Él/Suyo")`;
  return "";
}

export function isGenderKey(value: unknown): value is GenderKey {
  return value === "" || value === "feminino" || value === "masculino";
}
