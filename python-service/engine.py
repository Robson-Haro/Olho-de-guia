"""Motor de inteligência profissional do Eureka.

O módulo trabalha apenas com evidências profissionais fornecidas pelo usuário ou
presentes no trecho público do perfil. Não infere idade, gênero, raça, saúde,
deficiência ou qualquer outro dado pessoal sensível.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
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

# Vocabulário frequente em descrições corporativas. Esses termos podem ajudar a
# compreender a vaga, mas isoladamente não são competências distintivas e não
# devem inflar a aderência de qualquer perfil.
GENERIC_SKILL_TOKENS = {
    "gestao", "gestor", "equipe", "equipes", "processo", "processos", "area",
    "areas", "empresa", "empresas", "atividade", "atividades", "atuacao", "atuar",
    "conhecimento", "desenvolvimento", "resultado", "resultados", "melhoria",
    "continua", "projeto", "projetos", "cliente", "clientes", "negocio", "negocios",
    "superior", "completo", "graduacao", "ensino", "trabalho", "rotina", "rotinas",
    "apoio", "suporte", "garantir", "realizar", "acompanhar", "elaborar", "controle",
    "analise", "informacoes", "relatorio", "relatorios", "oportunidade", "requisito",
    "necessario", "diferencial", "industriais",
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
    "compensation_benefits": {
        "label": "Remuneração, Benefícios e Total Rewards",
        "functions": {
            "pt": ("remuneração e benefícios", "remuneração", "benefícios", "cargos e salários"),
            "en": ("compensation and benefits", "total rewards", "compensation", "employee benefits"),
            "es": ("compensación y beneficios", "compensación", "beneficios", "recompensa total"),
        },
        "signals": (
            "total rewards", "compensation and benefits", "comp & ben", "c&b",
            "job evaluation", "avaliacao de cargos", "hay", "mercer", "willis towers watson",
            "salary survey", "pesquisa salarial", "estrutura salarial", "incentivos de longo prazo",
            "long term incentive", "short term incentive", "remuneracao executiva",
        ),
        # Títulos praticados no mercado não seguem uma única ordem de palavras.
        # Esta base curada evita depender de combinações genéricas e cobre o
        # padrão encontrado no perfil do Daniel (Senior C&B/Payroll Manager).
        "curated_titles": {
            "pt": (
                "Head de Remuneração e Benefícios",
                "Gerente Executivo de Remuneração e Benefícios",
                "Gerente Sênior de Remuneração e Benefícios",
                "Diretor de Remuneração e Benefícios",
                "Head de Total Rewards",
                "Diretor de Total Rewards",
            ),
            "en": (
                "Head of Total Rewards",
                "Total Rewards Director",
                "Compensation and Benefits Director",
                "Senior Compensation and Benefits Manager",
                "Senior Compensation Benefits and Payroll Manager",
                "Global Total Rewards Head",
            ),
            "es": (
                "Head de Compensación y Beneficios",
                "Director de Compensación y Beneficios",
                "Gerente Senior de Compensación y Beneficios",
            ),
        },
        # Ordem usada nas primeiras consultas do Serper. Alternar idioma e
        # senioridade aumenta cobertura sem transformar a busca em RH genérico.
        "search_titles": (
            "Head of Total Rewards",
            "Gerente Sênior de Remuneração e Benefícios",
            "Compensation and Benefits Director",
            "Senior Compensation and Benefits Manager",
            "Diretor de Total Rewards",
            "Senior Compensation Benefits and Payroll Manager",
            "Global Total Rewards Head",
        ),
    },
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
    "business_partner": {
        "label": "Business Partner / HRBP",
        "functions": {
            "pt": ("business partner", "parceiro de negocio", "parceria com o negocio", "hr business partner"),
            "en": ("hr business partner", "people business partner", "human resources business partner"),
            "es": ("business partner de recursos humanos", "socio estrategico de recursos humanos", "business partner de personas"),
        },
        # Não basta pertencer a RH: este grupo exige evidência de atuação em
        # parceria com o negócio. Assim, "Gerente de RH" não vira resultado de
        # uma busca por BP apenas por ter senioridade semelhante.
        "signals": ("hrbp", "business partner", "parceiro de negocio", "parceria com o negocio", "people partner"),
        "curated_titles": {
            "pt": ("Business Partner de RH", "HR Business Partner", "Business Partner de Pessoas e Cultura"),
            "en": ("HR Business Partner", "People Business Partner", "Human Resources Business Partner"),
            "es": ("Business Partner de Recursos Humanos", "Socio Estrategico de Recursos Humanos"),
        },
        "search_titles": (
            "HR Business Partner", "People Business Partner", "Business Partner de RH",
            "Business Partner de Pessoas e Cultura", "Human Resources Business Partner",
        ),
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

# Um curtume é, por definição operacional, parte da cadeia do couro. Portanto,
# evidência pública de curtume também comprova o contexto de couro; o inverso
# não é verdadeiro (um perfil pode atuar com couro sem experiência em curtume).
KEYWORD_IMPLICATIONS: dict[str, tuple[str, ...]] = {
    "Curtume / Tannery": ("Couro / Leather",),
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
    "Estratégia de Total Rewards": (
        "total rewards", "estrategia de remuneracao", "compensation strategy",
        "reward strategy", "estrategia de compensacion", "recompensa total",
    ),
    "Remuneração executiva e incentivos": (
        "remuneracao executiva", "executive compensation", "compensacion ejecutiva",
        "incentivo de curto prazo", "short term incentive", "sti",
        "incentivo de longo prazo", "long term incentive", "lti",
    ),
    "Arquitetura de cargos e salários": (
        "cargos e salarios", "arquitetura de cargos", "job architecture", "job evaluation",
        "avaliacao de cargos", "hay methodology", "metodologia hay", "job grading",
    ),
    "Pesquisa e competitividade salarial": (
        "pesquisa salarial", "salary survey", "market pricing", "benchmark salarial",
        "competitividade salarial", "compensation benchmarking",
    ),
    "Benefícios corporativos": (
        "beneficios corporativos", "employee benefits", "benefits strategy",
        "gestao de beneficios", "benefits management", "beneficios para empleados",
    ),
    "HR Business Partner estratégico": (
        "hr business partner", "hrbp", "business partner de rh", "strategic hr business partner",
        "people business partner", "socio estrategico de recursos humanos",
    ),
    "Liderança integral de RH": (
        "lideranca de recursos humanos", "lideranca da area de recursos humanos", "head de rh",
        "head of hr", "hr director", "human resources director", "diretor de recursos humanos",
        "gestao de ponta a ponta", "end to end hr", "full hr lifecycle",
    ),
    "Relações trabalhistas e sindicais": (
        "relacoes trabalhistas", "relacoes sindicais", "sindicatos", "sindicato",
        "labor relations", "employee relations", "union relations", "collective bargaining",
        "relaciones laborales", "relaciones sindicales",
    ),
    "RH em operação industrial": (
        "rh industrial", "recursos humanos industrial", "operacao industrial", "fabrica",
        "manufacturing hr", "plant hr", "industrial operation", "industrial relations",
    ),
    "Turnover e retenção": (
        "turnover", "retencao", "retention", "attrition", "rotatividade",
    ),
    "Gestão da força de trabalho e custos": (
        "workforce management", "workforce planning", "gestao da forca de trabalho",
        "p&l de rh", "hr p&l", "people cost", "custo de pessoal", "otimizacao de custos",
    ),
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


@lru_cache(maxsize=20_000)
def _normalize_cached(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.lower().replace("&", " e ")
    return re.sub(r"[^a-z0-9+#]+", " ", normalized).strip()


def normalize(value: Any) -> str:
    # `normalize` é chamada dezenas de milhares de vezes por busca (cada perfil
    # × cada título equivalente × cada família profissional). Sem cache, a
    # normalização Unicode dominava o tempo de resposta do serviço Python.
    return _normalize_cached(str(value or ""))


# Conjunto fixo: era reconstruído a cada chamada de `tokens`, dentro dos laços
# mais quentes do motor.
SENSITIVE_TOKENS = frozenset(
    token for phrase in SENSITIVE_PHRASES for token in normalize(phrase).split()
)


def tokens(value: Any) -> list[str]:
    return [
        token for token in normalize(value).split()
        if len(token) > 2 and token not in STOP_WORDS and token not in SENSITIVE_TOKENS
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


@lru_cache(maxsize=20_000)
def _phrase_pattern(normalized_phrase: str) -> re.Pattern[str]:
    # Limites léxicos evitam falsos positivos graves: por exemplo, "cto"
    # (Chief Technology Officer) não pode ser encontrado dentro de "director".
    return re.compile(rf"(?:^|\s){re.escape(normalized_phrase)}(?:$|\s)")


def phrase_in(text: str, phrase: str) -> bool:
    normalized_phrase = normalize(phrase)
    if not normalized_phrase:
        return False
    # A compilação do padrão também é cacheada: antes, cada verificação
    # recompilava a expressão regular do zero.
    return bool(_phrase_pattern(normalized_phrase).search(normalize(text)))


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
    concept_list = list(concepts)
    matched_labels = {
        concept.label
        for concept in concept_list
        if any(phrase_in(normalized_candidate, alias) for alias in concept.aliases)
    }
    for source, implied_labels in KEYWORD_IMPLICATIONS.items():
        if source in matched_labels:
            matched_labels.update(implied_labels)
    matched = [concept.label for concept in concept_list if concept.label in matched_labels]
    missing = [concept.label for concept in concept_list if concept.label not in matched_labels]
    return matched, missing


def detect_level(title: str) -> str | None:
    normalized = normalize(title)
    # Títulos públicos às vezes trazem o cargo atual e um cargo anterior. Quando
    # houver mais de um nível, o mais sênior é a evidência mais conservadora.
    for level in reversed(LEVEL_ORDER):
        languages = LEVELS[level]
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
    # Business Partner é uma especialidade de RH, não sinônimo de qualquer
    # posição gerencial de RH. A prioridade evita a classificação ampla de RH
    # e, consequentemente, impede que gestores generalistas avancem na busca.
    bp_terms = (*family_phrases(ROLE_FAMILIES["business_partner"]), *ROLE_FAMILIES["business_partner"]["signals"])
    if any(phrase_in(title_text, term) for term in bp_terms):
        return "business_partner"
    if re.search(r"\bhr\b", title_text):
        return "human_resources"
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
    # Em famílias com nomenclatura muito variável, as alternativas curadas têm
    # precedência sobre combinações mecânicas. O título original permanece em
    # primeiro lugar para preservar a intenção informada pelo recrutador.
    variants.extend(family.get("search_titles", ()))
    for language in ("pt", "en", "es"):
        variants.extend(family.get("curated_titles", {}).get(language, ()))
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
    return unique(variants)[:16]


def detected_skills(description: str, explicit_keywords: Iterable[str] = ()) -> list[str]:
    text = normalize(description)
    result = [concept.label for concept in keyword_concepts(explicit_keywords)]
    for canonical, aliases in SKILL_GROUPS.items():
        if any(phrase_in(text, alias) for alias in aliases):
            result.append(canonical)

    if len(result) < 8:
        covered_tokens = {
            token
            for skill in result
            for alias in SKILL_GROUPS.get(skill, (skill,))
            for token in tokens(alias)
        }
        frequencies = Counter(tokens(description))
        for token, _ in frequencies.most_common(18):
            if (
                len(token) >= 4
                and not token.isdigit()
                and token not in GENERIC_SKILL_TOKENS
                and token not in covered_tokens
            ):
                result.append(token.capitalize())
            if len(unique(result)) >= 10:
                break
    return unique(result)[:10]


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


"""Tokens que indicam apenas hierarquia, nunca a função exercida."""
LEVEL_TOKENS = frozenset(
    token
    for languages in LEVELS.values()
    for variants in languages.values()
    for term in variants
    for token in normalize(term).split()
)


def core_tokens(value: Any) -> list[str]:
    """Tokens de FUNÇÃO, sem os termos de senioridade.

    "Payroll Analyst" e "Marketing Analyst" compartilham "analyst" e chegavam a
    50% de semelhança de título — o suficiente para uma exceção baseada em
    similaridade absolver um perfil de outra carreira. Comparar apenas o núcleo
    funcional elimina esse falso positivo.
    """
    return [token for token in tokens(value) if token not in LEVEL_TOKENS]


def _cosine(left_counts: Counter[str], right_counts: Counter[str]) -> float:
    if not left_counts or not right_counts:
        return 0.0
    intersection = set(left_counts) & set(right_counts)
    numerator = sum(left_counts[token] * right_counts[token] for token in intersection)
    denominator = math.sqrt(sum(value * value for value in left_counts.values())) * math.sqrt(
        sum(value * value for value in right_counts.values())
    )
    return numerator / denominator if denominator else 0.0


def core_similarity(left: str, right: str) -> float:
    return _cosine(Counter(core_tokens(left)), Counter(core_tokens(right)))


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


def location_alignment(job: dict[str, Any], candidate: dict[str, Any], candidate_text: str) -> tuple[float, str]:
    requested_cities = job.get("cities") if isinstance(job.get("cities"), list) else []
    requested = unique([
        *(str(city) for city in requested_cities),
        str(job.get("city") or ""),
        str(job.get("additionalCity") or ""),
    ])
    subdivision = str(job.get("subdivision") or "")
    country = str(job.get("country") or "")
    normalized = normalize(candidate_text)
    if any(phrase_in(normalized, location) for location in requested):
        return 10.0, "cidade selecionada confirmada"
    if subdivision and phrase_in(normalized, subdivision):
        return 8.0, "região selecionada confirmada"
    if country and phrase_in(normalized, country):
        return 6.0, "país selecionado confirmado"
    geographic_match = str(candidate.get("geographicMatch") or "")
    if geographic_match == "targeted":
        return 2.0, "consulta direcionada; localidade a confirmar no perfil"
    if job.get("countrywide") is True or job.get("nationwide") is True:
        return 0.0, "país não confirmado no trecho público"
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
        for field in ("title", "summary", "company", "city", "state", "country", "geographicLabel")
    )
    candidate_family = detect_family(title, candidate_text)
    candidate_level = detect_level(title)

    best_title_similarity = max(
        (cosine_similarity(variant, title) for variant in intelligence.equivalent_titles),
        default=0.0,
    )
    # Semelhança do NÚCLEO funcional do título, sem termos de hierarquia. É esta
    # medida — e não a semelhança bruta — que decide as exceções de elegibilidade.
    best_core_similarity = max(
        (core_similarity(variant, title) for variant in intelligence.equivalent_titles),
        default=0.0,
    )
    evidence_tokens = len(tokens(candidate_text))

    # Elegibilidade vem antes da pontuação. Um algoritmo de seleção não pode
    # transformar localização ou palavras corporativas genéricas em aderência
    # quando cargo/família e senioridade são incompatíveis.
    #
    # CORREÇÃO DA DUPLA ELIMINAÇÃO. A camada TypeScript já reprovou quem não tem
    # cargo, senioridade, critérios obrigatórios e geografia compatíveis. O
    # motor Python reprovava de novo, com uma taxonomia diferente e uma regra
    # rígida demais: `candidate_family == intelligence.family`. Como o trecho
    # público do Google tem cerca de 160 caracteres, `detect_family` devolve
    # None para a maior parte dos perfis — e ausência de evidência virava
    # reprovação. Duas listas de aprovados diferentes eliminando uma à outra é
    # a causa direta das buscas que terminavam em zero perfil.
    #
    # Agora: família desconhecida NÃO elimina (reduz a nota e a confiança);
    # família divergente elimina apenas quando o título também não sustenta a
    # candidatura.
    family_conflict = bool(
        intelligence.family
        and candidate_family
        and candidate_family != intelligence.family
    )
    # Família divergente só é absolvida com DUAS evidências simultâneas: núcleo
    # de título em comum e ao menos um sinal técnico da família da vaga no
    # trecho público. Uma só delas não basta — "Payroll Manager" compartilha o
    # núcleo "payroll" com um título de Total Rewards, e um gerente de RH
    # compartilha "recursos humanos" com um Business Partner. A exigência dupla
    # cobre o erro de classificação sem reabrir a porta para a carreira errada.
    family_signals = ROLE_FAMILIES[intelligence.family].get("signals", ()) if intelligence.family else ()
    family_signal_evidence = any(phrase_in(candidate_text, signal) for signal in family_signals)
    family_eligible = not (
        family_conflict and not (best_core_similarity >= 0.5 and family_signal_evidence)
    )
    family_unconfirmed = bool(intelligence.family and not candidate_family)
    if family_unconfirmed and best_core_similarity < 0.2:
        # Sem família e sem núcleo de título em comum não há evidência alguma de
        # aderência: seguir adiante seria completar a lista com desconhecidos.
        family_eligible = False
        family_unconfirmed = False
        family_conflict = True

    seniority_distance: int | None = None
    seniority_eligible = True
    if intelligence.level:
        if candidate_level:
            seniority_distance = abs(LEVEL_ORDER.index(intelligence.level) - LEVEL_ORDER.index(candidate_level))
            seniority_eligible = seniority_distance <= 1
        elif LEVEL_ORDER.index(intelligence.level) >= LEVEL_ORDER.index("manager"):
            # Numa posição de gerência ou acima, a senioridade precisa estar
            # visível. Mas um trecho público curto é falha do índice do Google,
            # não evidência de senioridade menor: nesse caso o perfil segue como
            # "a confirmar" em vez de ser descartado.
            seniority_eligible = evidence_tokens < 12
    eligible = family_eligible and seniority_eligible
    if intelligence.family and candidate_family == intelligence.family:
        # Estar na mesma família profissional é um bom sinal, mas não prova
        # aderência ao cargo: um Analista e um Diretor pertencem à mesma
        # família. A nota cheia exige também semelhança real de título.
        role_score = min(45.0, 26.0 + best_title_similarity * 19.0)
        title_alignment = (
            f"cargo equivalente em {intelligence.family_label}"
            if best_title_similarity >= 0.45
            else f"mesma família ({intelligence.family_label}), título divergente"
        )
    elif family_unconfirmed:
        # Família não confirmada no trecho público. O título continua sendo a
        # evidência disponível e recebe crédito parcial — em vez de a ausência
        # de informação ser tratada como prova de incompatibilidade.
        role_score = min(38.0, 14.0 + best_title_similarity * 30.0)
        title_alignment = (
            f"título compatível; família ({intelligence.family_label}) a confirmar no perfil"
            if best_title_similarity >= 0.4
            else "família e título não confirmados no trecho público"
        )
    else:
        role_score = min(34.0, best_title_similarity * 42.0)
        title_alignment = "cargo parcialmente relacionado" if role_score >= 18 else "cargo pouco relacionado"

    matches = skill_matches(intelligence.skills, candidate_text)
    matched_required, missing_required = keyword_evidence(intelligence.required_keywords, candidate_text)
    skill_denominator = min(max(len(intelligence.skills), 1), 6)
    visible_match_count = min(len(matches), skill_denominator)
    skill_score = min(30.0, (visible_match_count / skill_denominator) * 30.0)
    seniority_score, seniority_reason = level_alignment(intelligence.level, candidate_level)
    location_score, location_reason = location_alignment(job, candidate, candidate_text)
    source_breakdown = candidate.get("scoreBreakdown") if isinstance(candidate.get("scoreBreakdown"), dict) else {}
    try:
        source_noise = float(source_breakdown.get("ruido") or 0)
    except (TypeError, ValueError):
        source_noise = 0.0
    noise_penalty = min(30.0, abs(min(0.0, source_noise)))
    mapped_companies = job.get("mappedCompanies") if isinstance(job.get("mappedCompanies"), list) else []
    matched_company = next((str(company) for company in mapped_companies if phrase_in(normalize(candidate_text), str(company))), "")
    segment_score = 10.0 if matched_company else (2.0 if job.get("marketSegment") else 0.0)
    base_compatibility = round(max(0.0, min(
        100.0,
        role_score + skill_score + seniority_score + location_score + segment_score - noise_penalty,
    )))
    compatibility = base_compatibility
    confidence, confidence_label = evidence_confidence(candidate_text)

    missing = [skill for skill in intelligence.skills if skill not in matches][:5]
    reasons = [
        title_alignment,
        f"{visible_match_count}/{skill_denominator} competência(s) visível(is)",
        *(
            [f"{len(matched_required)}/{len(intelligence.required_keywords)} palavra(s)-chave obrigatória(s)"]
            if intelligence.required_keywords else []
        ),
        seniority_reason,
        location_reason,
    ]
    if job.get("marketSegment"):
        reasons.append(f"empresa do segmento: {matched_company}" if matched_company else "segmento direcionado; empresa a confirmar")
    if noise_penalty:
        reasons.append("trecho público com possível ruído de busca")
    ranked = dict(candidate)
    default_tier = "A" if not missing_required else ("B" if matched_required else "C")
    supplied_tier = str(candidate.get("tier") or "")
    tier = supplied_tier if supplied_tier in {"A", "B", "C"} else default_tier
    if missing_required and tier == "A":
        tier = default_tier
    # A evidência parcial reduz a nota, mas não elimina o profissional: o
    # trecho público do Google raramente repete todos os critérios.
    if tier == "B":
        compatibility = round(compatibility * 0.78)
    elif tier == "C":
        compatibility = round(compatibility * 0.55)
    tier_label = {
        "A": "evidência pública completa dos critérios prioritários",
        "B": "evidência pública parcial; confirmar o perfil completo",
        "C": "sem evidência pública suficiente; confirmar antes de abordar",
    }[tier]
    ranked.update({
        "eligible": eligible,
        "eligibilityReason": (
            f"família profissional divergente ({ROLE_FAMILIES[candidate_family]['label']}) sem sustentação no título"
            if not family_eligible and candidate_family else
            "família profissional incompatível"
            if not family_eligible else
            "senioridade incompatível com a vaga"
            if not seniority_eligible else
            "família a confirmar no perfil; título e senioridade compatíveis"
            if family_unconfirmed else
            "família profissional e senioridade compatíveis"
        ),
        "tier": tier,
        "tierLabel": tier_label,
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
        "scoreBreakdown": {
            "cargo": round(role_score),
            "senioridade": round(seniority_score),
            "competencias": round(skill_score),
            "localidade": round(location_score),
            "ruido": -round(noise_penalty),
            "evidencia": compatibility - base_compatibility,
            "segmento": round(segment_score),
        },
    })
    return ranked


TIER_RANK = {"A": 0, "B": 1, "C": 2}


def _ranking_key(item: dict[str, Any]) -> tuple[Any, ...]:
    return (
        TIER_RANK.get(str(item.get("tier") or "A"), 3),
        -int(item.get("compatibility") or 0),
        -int(item.get("evidenceConfidence") or 0),
        normalize(item.get("name")),
    )


def rank_candidates(
    job: dict[str, Any],
    candidates: Iterable[dict[str, Any]],
) -> tuple[JobIntelligence, list[dict[str, Any]], list[dict[str, Any]]]:
    intelligence = analyze_job(job)
    evaluated = [rank_candidate(job, intelligence, candidate) for candidate in candidates]

    # Qualidade continua sendo prioridade: a lista principal só recebe quem
    # comprova os requisitos mínimos, e nunca é completada com profissionais de
    # outra carreira ou nível hierárquico.
    ranked = sorted(
        (candidate for candidate in evaluated if candidate.get("eligible") is True),
        key=_ranking_key,
    )

    # Os reprovados deixam de desaparecer em silêncio. Voltam num conjunto de
    # EXPANSÃO separado, com a nota limitada a 45 e o motivo da reprovação
    # explícito, para que uma busca sem aprovados diga o que aconteceu em vez de
    # apenas exibir zero perfil.
    expansion = sorted(
        (candidate for candidate in evaluated if candidate.get("eligible") is not True),
        key=_ranking_key,
    )
    for candidate in expansion:
        candidate["compatibility"] = min(int(candidate.get("compatibility") or 0), 45)
        candidate["fitClassification"] = "expansion"

    for position, candidate in enumerate(ranked, start=1):
        candidate["rank"] = position
    for position, candidate in enumerate(expansion, start=1):
        candidate["rank"] = position
    return intelligence, ranked, expansion


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
