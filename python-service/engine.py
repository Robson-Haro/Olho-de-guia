"""Motor de inteligência profissional do Eureka.

O módulo trabalha apenas com evidências profissionais fornecidas pelo usuário ou
presentes no trecho público do perfil. Não infere idade, gênero, raça, saúde,
deficiência ou qualquer outro dado pessoal sensível.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import math
import re
import unicodedata
from typing import Any, Iterable


STOP_WORDS = {
    # Português
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos",
    "e", "em", "entre", "na", "nas", "no", "nos", "o", "os", "ou", "para",
    "por", "que", "se", "ser", "ter", "um", "uma", "vaga", "profissional",
    "responsavel", "responsabilidades", "requisitos", "desejavel", "experiencia",
    # Inglês
    "and", "at", "for", "from", "in", "of", "on", "or", "the", "to", "with",
    "job", "professional", "required", "requirements", "responsibilities",
    # Espanhol
    "con", "del", "el", "en", "la", "las", "los", "para", "por", "puesto",
    "profesional", "requisitos", "responsabilidades", "y",
}

# Guardrail de emprego: estes termos nunca viram competência nem aumentam a
# pontuação de um candidato, mesmo quando aparecem na descrição ou no snippet.
SENSITIVE_PHRASES = (
    "idade", "age", "edad", "genero", "gender", "sexo", "mulher", "homem",
    "female", "male", "raça", "raca", "race", "etnia", "ethnicity", "cor",
    "deficiencia", "deficiência", "pcd", "disability", "discapacidad", "saude",
    "saúde", "health", "religiao", "religião", "religion", "estado civil",
    "marital status", "orientacao sexual", "orientação sexual", "sexual orientation",
    "gravidez", "pregnancy", "nacionalidade", "nationality", "nacionalidad",
)
LEVELS: dict[str, dict[str, tuple[str, ...]]] = {
    "intern": {
        "pt": ("estagiario", "estagiaria"),
        "en": ("intern", "trainee"),
        "es": ("pasante", "practicante"),
    },
    "assistant": {
        "pt": ("auxiliar", "assistente"),
        "en": ("assistant", "associate"),
        "es": ("auxiliar", "asistente"),
    },
    "analyst": {
        "pt": ("analista",),
        "en": ("analyst",),
        "es": ("analista",),
    },
    "specialist": {
        "pt": ("especialista", "consultor"),
        "en": ("specialist", "consultant"),
        "es": ("especialista", "consultor"),
    },
    "supervisor": {
        "pt": ("supervisor", "supervisora"),
        "en": ("supervisor",),
        "es": ("supervisor", "supervisora"),
    },
    "coordinator": {
        "pt": ("coordenador", "coordenadora"),
        "en": ("coordinator", "lead"),
        "es": ("coordinador", "coordinadora"),
    },
    "manager": {
        "pt": ("gerente", "gestor", "gestora"),
        "en": ("manager", "head"),
        "es": ("gerente", "jefe", "jefa"),
    },
    "director": {
        "pt": ("diretor", "diretora"),
        "en": ("director", "vice president", "vp"),
        "es": ("director", "directora"),
    },
    "executive": {
        "pt": ("presidente",),
        "en": ("chief", "ceo", "cfo", "coo", "cto", "chro"),
        "es": ("presidente", "director ejecutivo"),
    },
}

LEVEL_ORDER = tuple(LEVELS)


ROLE_FAMILIES: dict[str, dict[str, Any]] = {
    "people_operations": {
        "label": "Administração de Pessoal / People Operations",
        "functions": {
            "pt": ("administração de pessoal", "departamento pessoal", "folha de pagamento", "recursos humanos operações"),
            "en": ("payroll", "people operations", "hr operations", "personnel administration"),
            "es": ("nómina", "administración de personal", "operaciones de recursos humanos"),
        },
        "signals": ("admissao", "rescisao", "ponto", "encargos", "beneficios", "e-social", "esocial"),
    },
    "talent_acquisition": {
        "label": "Atração de Talentos / Talent Acquisition",
        "functions": {
            "pt": ("atração de talentos", "recrutamento e seleção", "recrutamento"),
            "en": ("talent acquisition", "recruiting", "recruitment"),
            "es": ("atracción de talento", "reclutamiento y selección", "selección de personal"),
        },
        "signals": ("sourcing", "hunter", "entrevista", "shortlist", "linkedin recruiter", "gupy"),
    },
    "human_resources": {
        "label": "Recursos Humanos / Human Resources",
        "functions": {
            "pt": ("recursos humanos", "gestão de pessoas", "desenvolvimento humano"),
            "en": ("human resources", "people and culture", "people business partner"),
            "es": ("recursos humanos", "gestión de personas", "capital humano"),
        },
        "signals": ("clima", "engajamento", "desempenho", "treinamento", "hrbp", "business partner"),
    },
    "logistics": {
        "label": "Logística / Supply Chain",
        "functions": {
            "pt": ("logística", "cadeia de suprimentos", "transportes"),
            "en": ("logistics", "supply chain", "transportation"),
            "es": ("logística", "cadena de suministro", "transportes"),
        },
        "signals": ("inbound", "outbound", "frete", "transportadora", "roteirizacao", "estoque", "inventario"),
    },
    "procurement": {
        "label": "Compras / Procurement",
        "functions": {
            "pt": ("compras", "suprimentos", "aquisições"),
            "en": ("procurement", "purchasing", "strategic sourcing"),
            "es": ("compras", "abastecimiento", "adquisiciones"),
        },
        "signals": ("fornecedor", "negociacao", "saving", "spend", "contrato", "sourcing"),
    },
    "quality": {
        "label": "Qualidade / Quality",
        "functions": {
            "pt": ("qualidade", "garantia da qualidade", "controle de qualidade"),
            "en": ("quality", "quality assurance", "quality control"),
            "es": ("calidad", "aseguramiento de calidad", "control de calidad"),
        },
        "signals": ("haccp", "appcc", "iso", "auditoria", "bpf", "seguranca dos alimentos", "food safety"),
    },
    "production": {
        "label": "Produção / Manufacturing",
        "functions": {
            "pt": ("produção", "operações industriais", "manufatura"),
            "en": ("production", "manufacturing", "industrial operations"),
            "es": ("producción", "manufactura", "operaciones industriales"),
        },
        "signals": ("oee", "linha", "turno", "rendimento", "capacidade", "lean", "melhoria continua"),
    },
    "maintenance": {
        "label": "Manutenção / Maintenance",
        "functions": {
            "pt": ("manutenção", "confiabilidade"),
            "en": ("maintenance", "reliability"),
            "es": ("mantenimiento", "confiabilidad"),
        },
        "signals": ("preventiva", "preditiva", "corretiva", "pcm", "cmms", "mecanica", "eletrica"),
    },
    "engineering": {
        "label": "Engenharia / Engineering",
        "functions": {
            "pt": ("engenharia", "projetos de engenharia"),
            "en": ("engineering", "engineering projects"),
            "es": ("ingeniería", "proyectos de ingeniería"),
        },
        "signals": ("capex", "autocad", "projetos", "implantacao", "processos", "industrial"),
    },
    "process_excellence": {
        "label": "Padronização e Excelência de Processos",
        "functions": {
            "pt": ("padronização de processos", "gestão de processos", "excelência operacional", "melhoria contínua"),
            "en": ("process standardization", "process management", "operational excellence", "continuous improvement"),
            "es": ("estandarización de procesos", "gestión de procesos", "excelencia operacional", "mejora continua"),
        },
        "signals": (
            "governanca de processos", "governance", "mapeamento de processos", "process mapping",
            "bpm", "lean", "six sigma", "procedimentos", "sop", "processos industriais",
        ),
    },
    "data": {
        "label": "Dados / Data",
        "functions": {
            "pt": ("dados", "engenharia de dados", "ciência de dados", "inteligência de negócios"),
            "en": ("data", "data engineering", "data science", "business intelligence"),
            "es": ("datos", "ingeniería de datos", "ciencia de datos", "inteligencia de negocios"),
        },
        "signals": ("sql", "python", "etl", "spark", "power bi", "tableau", "bigquery", "databricks"),
    },
    "technology": {
        "label": "Tecnologia / Information Technology",
        "functions": {
            "pt": ("tecnologia da informação", "desenvolvimento de software", "sistemas"),
            "en": ("information technology", "software development", "systems"),
            "es": ("tecnología de la información", "desarrollo de software", "sistemas"),
        },
        "signals": ("desenvolvedor", "developer", "java", "javascript", "typescript", "cloud", "devops", "api"),
    },
    "finance": {
        "label": "Finanças / Finance",
        "functions": {
            "pt": ("finanças", "planejamento financeiro", "tesouraria", "controladoria"),
            "en": ("finance", "financial planning", "treasury", "controllership"),
            "es": ("finanzas", "planificación financiera", "tesorería", "control de gestión"),
        },
        "signals": ("fp&a", "budget", "forecast", "fluxo de caixa", "dre", "fechamento", "sap"),
    },
    "accounting_tax": {
        "label": "Contabilidade e Fiscal / Accounting & Tax",
        "functions": {
            "pt": ("contabilidade", "fiscal", "tributário", "impostos"),
            "en": ("accounting", "tax", "taxation"),
            "es": ("contabilidad", "fiscal", "tributario", "impuestos"),
        },
        "signals": ("icms", "pis", "cofins", "sped", "ifrs", "gaap", "apuração", "compliance tributario"),
    },
    "sales": {
        "label": "Comercial / Sales",
        "functions": {
            "pt": ("comercial", "vendas", "negócios"),
            "en": ("sales", "commercial", "business development"),
            "es": ("ventas", "comercial", "desarrollo de negocios"),
        },
        "signals": ("carteira", "cliente", "receita", "meta", "crm", "b2b", "negociacao"),
    },
    "marketing": {
        "label": "Marketing",
        "functions": {
            "pt": ("marketing", "trade marketing", "marca empregadora"),
            "en": ("marketing", "trade marketing", "employer branding"),
            "es": ("marketing", "trade marketing", "marca empleadora"),
        },
        "signals": ("campanha", "marca", "digital", "conteudo", "go to market", "sell out", "branding"),
    },
    "pricing": {
        "label": "Pricing / Precificação",
        "functions": {
            "pt": ("precificação", "pricing", "gestão de receita"),
            "en": ("pricing", "revenue management"),
            "es": ("precios", "pricing", "gestión de ingresos"),
        },
        "signals": ("margem", "elasticidade", "rentabilidade", "price", "receita", "portfolio"),
    },
}


KEYWORD_EQUIVALENTS: dict[str, tuple[str, ...]] = {
    "Couro / Leather": (
        "couro", "couros", "leather", "leather industry", "cuero", "cueros", "piel",
    ),
    "Curtume / Tannery": (
        "curtume", "curtumes", "tannery", "tanneries", "tanning", "curtiembre",
        "curtiembres", "curtiduria", "curtiduría", "curtido de cuero",
    ),
    "Padronização de processos": (
        "padronizacao de processos", "padronização de processos", "process standardization",
        "process governance", "governanca de processos", "governança de processos",
        "estandarizacion de procesos", "estandarización de procesos",
    ),
}


SKILL_GROUPS: dict[str, tuple[str, ...]] = {
    "Excel": ("excel", "planilhas avancadas", "tabela dinamica", "vlookup", "procv"),
    "Power BI": ("power bi", "powerbi"),
    "SQL": ("sql", "structured query language"),
    "Python": ("python",),
    "SAP": ("sap", "s/4hana", "s4 hana"),
    "Gupy": ("gupy",),
    "LinkedIn Recruiter": ("linkedin recruiter",),
    "Sourcing": ("sourcing", "busca ativa", "hunting"),
    "Entrevista por competências": ("entrevista por competencias", "competency based interview", "entrevista por competencias"),
    "Folha de pagamento": ("folha de pagamento", "payroll", "nomina"),
    "Admissão e rescisão": ("admissao", "rescisao", "onboarding", "offboarding"),
    "Legislação trabalhista": ("legislacao trabalhista", "clt", "labor law", "legislacion laboral"),
    "Indicadores / KPIs": ("indicadores", "kpi", "kpis", "metricas", "metrics"),
    "Gestão de projetos": ("gestao de projetos", "project management", "gestion de proyectos"),
    "Liderança": ("lideranca", "leadership", "liderazgo", "gestao de equipe", "team management"),
    "Negociação": ("negociacao", "negotiation", "negociacion"),
    "Inglês": ("ingles", "english"),
    "Espanhol": ("espanhol", "spanish", "espanol"),
    "Logística inbound": ("inbound", "recebimento"),
    "Logística outbound": ("outbound", "expedicao", "shipping"),
    "Gestão de estoque": ("estoque", "inventory", "inventario"),
    "Transportes": ("transportes", "transportation", "frete", "freight"),
    "Lean / melhoria contínua": ("lean", "melhoria continua", "continuous improvement", "mejora continua"),
    "Qualidade e auditoria": ("qualidade", "quality", "calidad", "auditoria", "audit"),
    "Segurança dos alimentos": ("seguranca dos alimentos", "food safety", "inocuidad alimentaria", "haccp", "appcc"),
    "Planejamento financeiro": ("planejamento financeiro", "financial planning", "planificacion financiera", "fp&a"),
    "Budget e forecast": ("budget", "forecast", "orcamento", "previsao"),
    "Recrutamento e seleção": ("recrutamento", "recruitment", "recruiting", "reclutamiento", "selecao"),
    "Clima e engajamento": ("clima", "engajamento", "engagement", "compromiso"),
    **KEYWORD_EQUIVALENTS,
}


@dataclass(frozen=True)
class KeywordConcept:
    label: str
    aliases: tuple[str, ...]


@dataclass(frozen=True)
class JobIntelligence:
    family: str | None
    family_label: str
    level: str | None
    equivalent_titles: tuple[str, ...]
    skills: tuple[str, ...]
    required_keywords: tuple[KeywordConcept, ...]


def normalize(value: Any) -> str:
    text = str(value or "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.lower().replace("&", " e ")
    return re.sub(r"[^a-z0-9+#.]+", " ", text).strip()


def tokens(value: Any) -> list[str]:
    sensitive_tokens = {token for phrase in SENSITIVE_PHRASES for token in normalize(phrase).split()}
    return [
        token for token in normalize(value).split()
        if len(token) > 2 and token not in STOP_WORDS and token not in sensitive_tokens
    ]


def unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = re.sub(r"\s+", " ", str(value or "")).strip()
        key = normalize(clean)
        if clean and key not in seen:
            seen.add(key)
            result.append(clean)
    return result


def phrase_in(text: str, phrase: str) -> bool:
    normalized_phrase = normalize(phrase)
    return bool(normalized_phrase and normalized_phrase in text)


def is_sensitive(value: str) -> bool:
    normalized = normalize(value)
    return any(phrase_in(normalized, phrase) for phrase in SENSITIVE_PHRASES)


def keyword_concepts(explicit_keywords: Iterable[str]) -> list[KeywordConcept]:
    """Transforma cada palavra-chave explícita em um critério obrigatório multilíngue.

    Um campo composto conhecido, como "Couro e Curtume", vira dois conceitos
    independentes. Termos sem taxonomia continuam obrigatórios pela grafia informada.
    """
    concepts: list[KeywordConcept] = []
    seen: set[str] = set()
    for value in explicit_keywords:
        raw = re.sub(r"\s+", " ", str(value or "")).strip()
        if not raw or is_sensitive(raw):
            continue
        normalized_raw = normalize(raw)
        matched_known_group = False
        for label, aliases in SKILL_GROUPS.items():
            if any(phrase_in(normalized_raw, alias) for alias in aliases):
                key = normalize(label)
                if key not in seen:
                    seen.add(key)
                    concepts.append(KeywordConcept(label=label, aliases=tuple(unique(aliases))))
                matched_known_group = True
        if not matched_known_group:
            key = normalize(raw)
            if key not in seen:
                seen.add(key)
                concepts.append(KeywordConcept(label=raw, aliases=(raw,)))
    return concepts


def keyword_evidence(concepts: Iterable[KeywordConcept], candidate_text: str) -> tuple[list[str], list[str]]:
    normalized_candidate = normalize(candidate_text)
    matched: list[str] = []
    missing: list[str] = []
    for concept in concepts:
        target = matched if any(phrase_in(normalized_candidate, alias) for alias in concept.aliases) else missing
        target.append(concept.label)
    return matched, missing


def detect_level(title: str) -> str | None:
    normalized = normalize(title)
    for level, languages in LEVELS.items():
        for variants in languages.values():
            if any(phrase_in(normalized, variant) for variant in variants):
                return level
    return None


def family_phrases(family: dict[str, Any]) -> list[str]:
    functions = family["functions"]
    return [phrase for language in functions.values() for phrase in language]


def detect_family(title: str, description: str = "") -> str | None:
    title_text = normalize(title)
    description_text = normalize(description)
    scores: dict[str, float] = {}
    for key, family in ROLE_FAMILIES.items():
        score = 0.0
        for phrase in family_phrases(family):
            if phrase_in(title_text, phrase):
                score += 8 + min(4, len(tokens(phrase)))
            if phrase_in(description_text, phrase):
                score += 2
        for signal in family.get("signals", ()):
            if phrase_in(title_text, signal):
                score += 4
            if phrase_in(description_text, signal):
                score += 1
        if score:
            scores[key] = score
    return max(scores, key=scores.get) if scores else None


def title_case(value: str) -> str:
    minor = {"de", "da", "do", "e", "of", "and", "y", "la", "del"}
    return " ".join(word if index and word.lower() in minor else word.capitalize()
                    for index, word in enumerate(value.split()))


def equivalent_titles(title: str, family_key: str | None, level: str | None) -> list[str]:
    variants = [title]
    if not family_key:
        return unique(variants)

    family = ROLE_FAMILIES[family_key]
    functions = family["functions"]
    if level:
        # Primeiro uma alternativa por idioma. As quatro primeiras consultas
        # cobrem o título original, português, inglês e espanhol.
        for language in ("pt", "en", "es"):
            level_terms = LEVELS[level][language]
            function_terms = functions[language]
            function = function_terms[0]
            if language == "en":
                variants.append(f"{title_case(function)} {title_case(level_terms[0])}")
            else:
                variants.append(f"{title_case(level_terms[0])} de {title_case(function)}")
        for language in ("pt", "en", "es"):
            level_term = LEVELS[level][language][0]
            for function in functions[language][1:3]:
                variants.append(
                    f"{title_case(function)} {title_case(level_term)}"
                    if language == "en"
                    else f"{title_case(level_term)} de {title_case(function)}"
                )
    else:
        for language in ("pt", "en", "es"):
            variants.extend(title_case(value) for value in functions[language][:3])
    return unique(variants)[:10]


def detected_skills(description: str, explicit_keywords: Iterable[str] = ()) -> list[str]:
    text = normalize(description)
    result = [concept.label for concept in keyword_concepts(explicit_keywords)]
    for canonical, aliases in SKILL_GROUPS.items():
        if any(phrase_in(text, alias) for alias in aliases):
            result.append(canonical)

    if len(result) < 8:
        frequencies = Counter(tokens(description))
        for token, _ in frequencies.most_common(18):
            if len(token) >= 4 and not token.isdigit():
                result.append(token.capitalize())
            if len(unique(result)) >= 10:
                break
    return unique(result)[:12]


def analyze_job(job: dict[str, Any]) -> JobIntelligence:
    title = str(job.get("title") or "").strip()
    description = str(job.get("description") or "").strip()
    explicit = job.get("keywords") if isinstance(job.get("keywords"), list) else []
    family = detect_family(title, description)
    level = detect_level(title)
    return JobIntelligence(
        family=family,
        family_label=ROLE_FAMILIES[family]["label"] if family else "Função específica",
        level=level,
        equivalent_titles=tuple(equivalent_titles(title, family, level)),
        skills=tuple(detected_skills(description, explicit)),
        required_keywords=tuple(keyword_concepts(explicit)),
    )


def cosine_similarity(left: str, right: str) -> float:
    left_counts = Counter(tokens(left))
    right_counts = Counter(tokens(right))
    if not left_counts or not right_counts:
        return 0.0
    intersection = set(left_counts) & set(right_counts)
    numerator = sum(left_counts[token] * right_counts[token] for token in intersection)
    denominator = math.sqrt(sum(value * value for value in left_counts.values())) * math.sqrt(
        sum(value * value for value in right_counts.values())
    )
    return numerator / denominator if denominator else 0.0


def skill_matches(skills: Iterable[str], candidate_text: str) -> list[str]:
    normalized = normalize(candidate_text)
    matches: list[str] = []
    for skill in skills:
        aliases = SKILL_GROUPS.get(skill, (skill,))
        if any(phrase_in(normalized, alias) for alias in aliases):
            matches.append(skill)
    return unique(matches)


def level_alignment(job_level: str | None, candidate_level: str | None) -> tuple[float, str]:
    if not job_level:
        return 8.0, "senioridade não especificada"
    if not candidate_level:
        return 5.0, "senioridade não confirmada no trecho público"
    job_index = LEVEL_ORDER.index(job_level)
    candidate_index = LEVEL_ORDER.index(candidate_level)
    distance = abs(job_index - candidate_index)
    if distance == 0:
        return 15.0, "senioridade compatível"
    if distance == 1:
        return 10.0, "senioridade próxima"
    if distance == 2:
        return 4.0, "diferença relevante de senioridade"
    return 0.0, "senioridade distante da vaga"


def location_alignment(job: dict[str, Any], candidate_text: str) -> tuple[float, str]:
    if job.get("nationwide") is True:
        return 10.0, "busca nacional"
    requested = unique([str(job.get("city") or ""), str(job.get("additionalCity") or "")])
    normalized = normalize(candidate_text)
    if any(phrase_in(normalized, location) for location in requested):
        return 10.0, "localidade compatível"
    return 0.0, "localidade não confirmada"


def evidence_confidence(candidate_text: str) -> tuple[int, str]:
    length = len(tokens(candidate_text))
    if length >= 35:
        return 90, "alta"
    if length >= 16:
        return 70, "média"
    return 45, "baixa"


def rank_candidate(job: dict[str, Any], intelligence: JobIntelligence, candidate: dict[str, Any]) -> dict[str, Any]:
    title = str(candidate.get("title") or "")
    candidate_text = " ".join(
        str(candidate.get(field) or "")
        for field in ("title", "summary", "company", "city", "state")
    )
    candidate_family = detect_family(title, candidate_text)
    candidate_level = detect_level(title)

    if intelligence.family and candidate_family == intelligence.family:
        role_score = 45.0
        title_alignment = f"cargo equivalente em {intelligence.family_label}"
    else:
        best_title_similarity = max(
            (cosine_similarity(variant, title) for variant in intelligence.equivalent_titles),
            default=0.0,
        )
        role_score = min(38.0, best_title_similarity * 45.0)
        title_alignment = "cargo parcialmente relacionado" if role_score >= 18 else "cargo pouco relacionado"

    matches = skill_matches(intelligence.skills, candidate_text)
    matched_required, missing_required = keyword_evidence(intelligence.required_keywords, candidate_text)
    skill_denominator = min(max(len(intelligence.skills), 1), 6)
    skill_score = min(30.0, (len(matches) / skill_denominator) * 30.0)
    seniority_score, seniority_reason = level_alignment(intelligence.level, candidate_level)
    location_score, location_reason = location_alignment(job, candidate_text)
    compatibility = round(min(100.0, role_score + skill_score + seniority_score + location_score))
    confidence, confidence_label = evidence_confidence(candidate_text)

    missing = [skill for skill in intelligence.skills if skill not in matches][:5]
    reasons = [
        title_alignment,
        f"{len(matches)}/{min(len(intelligence.skills), 6)} competência(s) visível(is)",
        *(
            [f"{len(matched_required)}/{len(intelligence.required_keywords)} palavra(s)-chave obrigatória(s)"]
            if intelligence.required_keywords else []
        ),
        seniority_reason,
        location_reason,
    ]
    ranked = dict(candidate)
    ranked.update({
        "compatibility": compatibility,
        "matchReason": " · ".join(reasons),
        "matchedSkills": matches[:8],
        "missingSkills": missing,
        "matchedRequiredKeywords": matched_required,
        "missingRequiredKeywords": missing_required,
        "titleAlignment": title_alignment,
        "evidenceConfidence": confidence,
        "evidenceLabel": confidence_label,
        "rankingEngine": "Python 3 · motor multilíngue",
    })
    return ranked


def rank_candidates(job: dict[str, Any], candidates: Iterable[dict[str, Any]]) -> tuple[JobIntelligence, list[dict[str, Any]]]:
    intelligence = analyze_job(job)
    ranked = [rank_candidate(job, intelligence, candidate) for candidate in candidates]
    ranked = [candidate for candidate in ranked if not candidate.get("missingRequiredKeywords")]
    ranked.sort(
        key=lambda item: (
            int(item.get("compatibility") or 0),
            int(item.get("evidenceConfidence") or 0),
            normalize(item.get("name")),
        ),
        reverse=True,
    )
    for position, candidate in enumerate(ranked, start=1):
        candidate["rank"] = position
    return intelligence, ranked


def intelligence_payload(intelligence: JobIntelligence) -> dict[str, Any]:
    return {
        "family": intelligence.family,
        "familyLabel": intelligence.family_label,
        "level": intelligence.level,
        "equivalentTitles": list(intelligence.equivalent_titles),
        "skills": list(intelligence.skills),
        "requiredKeywords": [
            {"label": concept.label, "aliases": list(concept.aliases)}
            for concept in intelligence.required_keywords
        ],
        "languages": ["pt", "en", "es"],
    }
