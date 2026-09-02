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

from lexicon import (
    SYNONYM_GROUPS,
    evidence_groups,
    is_weak_title_noun,
    expand as lexicon_expand,
    group_label,
    groups_for_term,
    groups_in_text,
    specific_groups,
)


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
    # Núcleo funcional do cargo e vocabulário distintivo da vaga, ambos já
    # expandidos para português, inglês e espanhol pelo léxico. São estes dois
    # conjuntos — e não mais a família profissional — que decidem elegibilidade,
    # e são eles que a camada TypeScript recebe para julgar sobre exatamente o
    # mesmo vocabulário. Enquanto cada motor mantinha a própria lista, os dois
    # se eliminavam mutuamente.
    role_core: tuple[str, ...] = ()
    domain_terms: tuple[str, ...] = ()
    domain_concepts: tuple[tuple[str, ...], ...] = ()
    role_groups: frozenset[int] = frozenset()
    domain_groups: frozenset[int] = frozenset()


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


def _lexicon_titles(title: str, level: str | None, role_groups: frozenset[int]) -> list[str]:
    """Títulos equivalentes montados a partir do léxico, para QUALQUER cargo.

    A geração anterior dependia de a vaga cair numa das 19 famílias cadastradas.
    Fora delas — abate, comércio exterior, trading, veterinária, meio ambiente —
    o motor devolvia apenas o título digitado, e a busca em inglês e espanhol
    simplesmente não acontecia.
    """
    if not role_groups:
        return []
    # Devolve o NÚCLEO funcional puro, sem compor a hierarquia. Compor produzia
    # híbridos que não existem no mercado ("Supervisor de Slaughter") e gastava
    # consultas do Serper com expressões que o Google nunca encontra. A
    # combinação com o nível é feita na camada de busca, que junta os dois
    # blocos — ("supervisor" OR "supervisora") ("abate" OR "slaughter") — e
    # alcança qualquer ordem de palavras.
    variants: list[str] = []
    for index in sorted(role_groups):
        for synonym in SYNONYM_GROUPS[index][:4]:
            variants.append(title_case(synonym))
    return variants


def equivalent_titles(
    title: str,
    family_key: str | None,
    level: str | None,
    role_groups: frozenset[int] = frozenset(),
) -> list[str]:
    variants = [title, *_lexicon_titles(title, level, role_groups)]
    if not family_key:
        return unique(variants)[:16]

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


# Verbos e conectores típicos de texto de anúncio de vaga. Sem esta trava, a
# extração por frequência devolvia "Supervisionar", "Garantir" e "Realizar" como
# se fossem competências, e passava a cobrar do candidato que ele repetisse o
# verbo da descrição no próprio perfil.
JOB_POSTING_VERBS = {
    "supervisionar", "garantir", "realizar", "acompanhar", "elaborar", "executar",
    "coordenar", "gerenciar", "administrar", "conduzir", "promover", "assegurar",
    "atuar", "auxiliar", "participar", "definir", "propor", "manter", "zelar",
    "identificar", "avaliar", "monitorar", "reportar", "planejar", "organizar",
    "estabelecer", "implementar", "implantar", "desenvolver", "controlar",
    "verificar", "analisar", "revisar", "validar", "aplicar", "buscar",
    "ensure", "manage", "lead", "develop", "execute", "support", "deliver",
    "gestionar", "garantizar", "asegurar", "realizar", "desarrollar",
}

# Fragmentos que aparecem sozinhos quando uma expressão hifenizada é quebrada
# ("bem-estar" vira "bem" e "estar"). Nenhum deles é competência.
WORD_FRAGMENTS = {
    "estar", "bem", "sendo", "todo", "toda", "todos", "todas", "cada", "onde",
    "quando", "muito", "muita", "mais", "menos", "seja", "sejam", "deve", "devem",
    "seus", "suas", "nosso", "nossa", "nossos", "nossas", "demais", "junto",
    "meio", "geral", "gerais", "novo", "nova", "novos", "novas", "alto", "alta",
}


def _distinctive_phrases(description: str, title: str) -> list[str]:
    """Expressões distintivas da vaga, priorizando as de duas palavras.

    Uma expressão de duas palavras carrega muito mais informação do que a soma
    das suas partes: "bem-estar animal" identifica a vaga, "estar" não identifica
    nada. Por isso os bigramas são avaliados primeiro, e um unigrama só é aceito
    quando sobrevive a três filtros — não é verbo de anúncio, não é fragmento de
    palavra composta e não é vocabulário corporativo genérico.
    """
    normalized_title = normalize(title)
    words = [word for word in normalize(description).split() if word not in STOP_WORDS]
    bigrams = Counter(
        f"{left} {right}"
        for left, right in zip(words, words[1:])
        if len(left) > 3 and len(right) > 3
        and left not in GENERIC_SKILL_TOKENS and right not in GENERIC_SKILL_TOKENS
        and left not in JOB_POSTING_VERBS and right not in JOB_POSTING_VERBS
        and left not in WORD_FRAGMENTS and right not in WORD_FRAGMENTS
    )
    unigrams = Counter(tokens(description))

    chosen: list[str] = []
    # Um bigrama entra se o léxico o reconhece (é vocabulário de mercado) ou se
    # ele se repete na descrição (o redator o tratou como termo, não como acaso).
    for phrase, count in bigrams.most_common(40):
        if groups_for_term(phrase) or count >= 2:
            chosen.append(phrase)
        if len(chosen) >= 8:
            break
    for token, count in unigrams.most_common(30):
        if len(chosen) >= 12:
            break
        if (
            len(token) >= 4
            and not token.isdigit()
            and token not in GENERIC_SKILL_TOKENS
            and token not in JOB_POSTING_VERBS
            and token not in WORD_FRAGMENTS
            and not any(token in phrase.split() for phrase in chosen)
            # Reconhecido pelo léxico, presente no título, ou repetido: qualquer
            # uma das três provas que o termo pertence à vaga, e não ao ruído.
            and (groups_for_term(token) or phrase_in(normalized_title, token) or count >= 2)
        ):
            chosen.append(token)
    return chosen


def detected_skills(description: str, explicit_keywords: Iterable[str] = (), title: str = "") -> list[str]:
    text = normalize(description)
    result = [concept.label for concept in keyword_concepts(explicit_keywords)]
    for canonical, aliases in SKILL_GROUPS.items():
        if any(phrase_in(text, alias) for alias in aliases):
            result.append(canonical)

    if len(result) < 8:
        covered = {
            token
            for skill in result
            for alias in SKILL_GROUPS.get(skill, (skill,))
            for token in tokens(alias)
        }
        for phrase in _distinctive_phrases(description, title):
            if not any(token in covered for token in phrase.split()):
                result.append(title_case(phrase))
            if len(unique(result)) >= 10:
                break
    return unique(result)[:10]


def job_vocabulary(title: str, description: str, explicit_keywords: Iterable[str] = ()) -> tuple[
    list[str], list[str], tuple[tuple[str, ...], ...], frozenset[int], frozenset[int]
]:
    """Núcleo funcional do cargo e vocabulário distintivo da vaga, em 3 idiomas.

    Substitui a família profissional como critério de elegibilidade. A família
    era uma classificação: precisava conter a carreira do candidato, e o que ela
    não continha ela julgava errado. Estes dois conjuntos são evidência: são
    extraídos da própria vaga, cobrem qualquer cargo e degradam suavemente
    quando o léxico não conhece um termo.
    """
    core = [token for token in core_tokens(title) if token not in STOP_WORDS]
    # Expressões compostas do título contam como uma unidade — "comércio
    # exterior" não é "comércio" mais "exterior".
    core_words = normalize(title).split()
    for size in (3, 2):
        for start in range(max(0, len(core_words) - size + 1)):
            phrase = " ".join(core_words[start:start + size])
            if groups_for_term(phrase):
                core.append(phrase)
    # Guarda-chuvas caem fora quando o título traz uma função específica: em
    # "Business Partner de RH", quem define a função é "business partner". Vale
    # também quando essa função está fora do léxico e sobrevive só pela grafia.
    has_specific_literal = any(
        not groups_for_term(term) and not is_weak_title_noun(term) for term in core
    )
    role_groups = specific_groups(
        (index for term in core for index in groups_for_term(term)),
        has_specific_literal=has_specific_literal,
    )
    # O núcleo enviado adiante é o das funções que sobreviveram, para que a
    # camada de busca não gaste consultas com a área guarda-chuva inteira.
    role_core = lexicon_expand(
        [term for term in core if not groups_for_term(term) or set(groups_for_term(term)) & role_groups],
        limit=80,
    )

    domain_seed = [
        *(str(keyword) for keyword in explicit_keywords if str(keyword or "").strip()),
        *_distinctive_phrases(description, title),
    ]
    domain_terms = lexicon_expand(domain_seed, limit=140)
    domain_groups = evidence_groups(
        {index for term in domain_seed for index in groups_for_term(term)} | groups_in_text(description)
    )
    # Conceitos de domínio: os grupos do léxico mais os termos do recrutador que
    # o léxico não conhece — cada um como um conceito de um único sinônimo.
    concepts = [SYNONYM_GROUPS[index] for index in sorted(domain_groups)]
    known = {term for group in concepts for term in group}
    for term in domain_seed:
        normalized = normalize(term)
        if normalized and len(normalized) > 3 and not groups_for_term(term) and normalized not in known:
            known.add(normalized)
            concepts.append((normalized,))
    return role_core, domain_terms, tuple(concepts[:14]), role_groups, domain_groups


def _external_list(job: dict[str, Any], field: str) -> list[str]:
    value = job.get(field)
    return [str(item) for item in value if str(item or "").strip()] if isinstance(value, list) else []


def declared_technical_requirements(description: str) -> list[KeywordConcept]:
    """Extrai integrações e plataformas declaradas, quando não há chips.

    Requisitos de negócio não viram uma trava automática: apenas tecnologias
    nomeadas explicitamente na descrição entram nesta camada de evidência.
    """
    patterns = (
        ("totvs protheus", r"\btotvs\s+protheus\b"),
        ("successfactors employee central", r"\b(?:sap\s+)?successfactors\s+employee\s+central\b"),
        ("apis rest", r"\b(?:apis?|api)\s+rest\b"),
        ("webservices", r"\bweb\s*services?\b"),
        ("xml", r"\bxml\b"),
        ("json", r"\bjson\b"),
        ("sql", r"\bsql\b"),
    )
    normalized = normalize(description)
    return [
        KeywordConcept(label=label, aliases=(label,))
        for label, pattern in patterns
        if re.search(pattern, normalized)
    ]


def analyze_job(job: dict[str, Any]) -> JobIntelligence:
    title = str(job.get("title") or "").strip()
    description = str(job.get("description") or "").strip()
    explicit = job.get("keywords") if isinstance(job.get("keywords"), list) else []
    family = detect_family(title, description)
    level = detect_level(title)
    role_core, domain_terms, domain_concepts, role_groups, domain_groups = job_vocabulary(
        title, description, explicit,
    )

    # VOCABULÁRIO AMPLIADO PELA LEITURA E PELA MEMÓRIA (Onda 2).
    #
    # A camada TypeScript já leu a vaga com o modelo e já carregou o que a casa
    # aprendeu. Esses termos chegam aqui prontos e são SOMADOS ao léxico — o
    # ranking passa a decidir sobre o mesmo vocabulário que gerou as consultas.
    # Sem isso, a busca encontraria o perfil em inglês e o ranking o descartaria
    # por não reconhecer o termo: seria a dupla eliminação de volta, com outro
    # nome.
    external_core = _external_list(job, "roleCoreExtra")
    learned_titles = _external_list(job, "learnedTitles")
    learned_terms = _external_list(job, "learnedTerms")
    if external_core:
        role_core = unique([*role_core, *(normalize(term) for term in external_core)])
        role_groups = role_groups | frozenset(
            index for term in external_core for index in groups_for_term(term)
        )
    external_concepts = job.get("domainConceptsExtra")
    if isinstance(external_concepts, list):
        known_terms = {normalize(term) for group in domain_concepts for term in group}
        extra_groups: list[tuple[str, ...]] = []
        for group in external_concepts:
            if not isinstance(group, list):
                continue
            terms = tuple(normalize(term) for term in group if str(term or "").strip())
            # O vocabulário externo passa pelas MESMAS travas do léxico. Sem
            # isso, o modelo poderia devolver "bovino" como conceito de domínio
            # numa vaga de abate e um comprador de gado voltaria a contar como
            # evidência — a regra de guarda-chuva seria contornada pela porta da
            # leitura, e a precisão da Onda 1 se perderia em silêncio.
            group_indexes = {index for term in terms for index in groups_for_term(term)}
            if group_indexes and not evidence_groups(group_indexes):
                continue
            # Um conceito novo só entra se nenhum dos seus termos já pertencer a
            # um conceito existente: caso contrário "bovino" e "beef" contariam
            # como duas evidências para o mesmo fato.
            if terms and not any(term in known_terms for term in terms):
                known_terms.update(terms)
                extra_groups.append(terms)
        domain_concepts = (*domain_concepts, *extra_groups)
        domain_terms = unique([*domain_terms, *(term for group in extra_groups for term in group)])
    if learned_terms:
        # Termos confirmados pelas aprovações do time entram como domínio: é o
        # vocabulário que a casa provou que identifica um bom candidato.
        domain_terms = unique([*domain_terms, *(normalize(term) for term in learned_terms)])
    return JobIntelligence(
        family=family,
        family_label=ROLE_FAMILIES[family]["label"] if family else "Função específica",
        level=level,
        equivalent_titles=tuple(unique([
            *equivalent_titles(title, family, level, role_groups),
            *_external_list(job, "titleVariantsExtra"),
            *learned_titles,
        ])[:28]),
        skills=tuple(detected_skills(description, explicit, title)),
        # Os chips preenchidos pelo recrutador continuam sendo a fonte
        # prioritária. Sem eles, apenas tecnologias explicitamente declaradas
        # na descrição entram como requisito: domínios de negócio não devem
        # virar uma trava automática de compatibilidade.
        required_keywords=tuple(
            keyword_concepts(explicit) if explicit else declared_technical_requirements(description)
        ),
        role_core=tuple(role_core),
        domain_terms=tuple(domain_terms),
        domain_concepts=domain_concepts,
        role_groups=role_groups,
        domain_groups=domain_groups,
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


def evidence_confidence(candidate_text: str, independent_signals: int = 0) -> tuple[int, str]:
    """Confiança na leitura, e não aderência do candidato.

    Passou a considerar quantos critérios independentes foram confirmados, e não
    só o tamanho do trecho: um trecho longo cheio de texto institucional não é
    mais confiável do que um trecho curto que confirma função, domínio e
    senioridade.
    """
    length = len(tokens(candidate_text))
    score = 30
    if length >= 35:
        score += 30
    elif length >= 16:
        score += 18
    else:
        score += 6
    score += min(4, independent_signals) * 10
    score = min(98, score)
    return score, "alta" if score >= 80 else "média" if score >= 60 else "baixa"


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
    # Semelhança do NÚCLEO funcional, sem termos de hierarquia.
    #
    # A comparação de ELEGIBILIDADE usa apenas o título da vaga e o núcleo
    # traduzido pelo léxico — nunca a lista ampla de títulos equivalentes. A
    # lista ampla existe para AMPLIAR a busca e contém títulos de mercado com
    # funções agregadas: "Senior Compensation Benefits and Payroll Manager" é um
    # título real, mas a palavra "payroll" dentro dele deixava entrar um gerente
    # de folha de pagamento numa vaga de Total Rewards. Ampliar a busca e
    # decidir quem entra na lista são decisões diferentes e passam a usar
    # conjuntos diferentes.
    eligibility_titles = (str(job.get("title") or ""), *intelligence.role_core[:24])
    best_core_similarity = max(
        (core_similarity(variant, title) for variant in eligibility_titles if variant),
        default=0.0,
    )
    evidence_tokens = len(tokens(candidate_text))

    # ------------------------------------------------------------------ #
    # ELEGIBILIDADE POR EVIDÊNCIA, NÃO POR TAXONOMIA
    #
    # A regra anterior era `candidate_family == intelligence.family`, com
    # exceções. Ela tinha um defeito que a medição expôs: o comportamento se
    # invertia conforme a família fosse ou não reconhecida. Numa vaga de
    # Supervisor de Abate — família "Produção" — o Slaughter Supervisor era
    # reprovado por "família divergente (Qualidade)", porque o trecho público
    # continha a palavra HACCP. Numa vaga de Meio Ambiente, que a taxonomia não
    # cobre, o filtro deixava de filtrar e aprovava até um trader de carnes.
    #
    # A regra nova não classifica ninguém. Ela pergunta se existe evidência
    # pública ligando o perfil à vaga, usando o vocabulário extraído da própria
    # vaga e traduzido pelo léxico:
    #
    #   1. o perfil exerce a MESMA FUNÇÃO (núcleo do cargo, em qualquer idioma)?
    #   2. ou o perfil demonstra o DOMÍNIO da vaga (dois ou mais termos
    #      distintivos)?
    #
    # Uma das duas basta para seguir. Nenhuma das duas reprova. Exigir dois
    # termos de domínio, e não um, é deliberado: um único termo adjacente
    # ("auditoria" aparece em qualidade e em controladoria) não deve carregar
    # um perfil de outra carreira para dentro da lista.
    #
    # A família profissional continua sendo calculada, mas passou a ser apenas
    # sinal de confiança na explicação. Ela não reprova mais ninguém.
    # ------------------------------------------------------------------ #
    candidate_groups = groups_in_text(candidate_text)
    candidate_title_groups = groups_in_text(title)
    role_group_hits = intelligence.role_groups & candidate_title_groups
    role_group_hits_text = intelligence.role_groups & candidate_groups
    domain_group_hits = intelligence.domain_groups & candidate_groups

    normalized_candidate = normalize(candidate_text)
    normalized_title = normalize(title)
    # Termos fora do léxico continuam valendo pela grafia — a cobertura
    # incompleta do dicionário reduz o alcance da tradução, nunca elimina o
    # termo informado pelo recrutador.
    # Termos literais fracos ("trabalho", "geral", "planta") não provam função:
    # eles casam com metade do mercado. Fora do léxico, só um termo distintivo
    # do título vale como evidência funcional.
    literal_role_hits = [
        term for term in intelligence.role_core[:40]
        if not is_weak_title_noun(term) and phrase_in(normalized_title, term)
    ]
    literal_domain_hits = [
        term for term in intelligence.domain_terms[:60]
        if len(term) > 3 and phrase_in(normalized_candidate, term)
    ]

    weak_function_evidence = bool(role_group_hits_text) or best_core_similarity >= 0.2
    function_evidence = (
        bool(role_group_hits or literal_role_hits)
        or best_core_similarity >= 0.34
        # Título genérico com a função no corpo do trecho: um "Supervisor de
        # Produção" cujo perfil diz "abate bovino, rendimento de carcaça"
        # exerce a função da vaga. Exigir também confirmação de domínio impede
        # que uma menção solta à palavra sirva de passaporte.
        or (bool(role_group_hits_text) and len(domain_group_hits) >= 2)
    )
    domain_evidence_count = len(domain_group_hits) + len(
        [term for term in literal_domain_hits if not any(
            term in SYNONYM_GROUPS[index] for index in domain_group_hits
        )]
    )
    domain_evidence = domain_evidence_count >= 2
    # Domínio forte (três ou mais termos) sustenta sozinho um profissional que
    # usa outro nome de cargo para a mesma função — o caso clássico do bom
    # candidato com título atípico. Domínio fraco precisa de apoio no título.
    function_eligible = (
        function_evidence
        or domain_evidence_count >= 3
        or (domain_evidence and weak_function_evidence)
    )

    family_conflict = bool(
        intelligence.family and candidate_family and candidate_family != intelligence.family
    )
    family_unconfirmed = bool(intelligence.family and not candidate_family)
    family_eligible = function_eligible

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

    # A nota do cargo passa a refletir a evidência efetivamente encontrada, e
    # não o pertencimento a uma família. Um perfil que exerce a função recebe
    # nota alta mesmo que a taxonomia o tenha classificado noutro lugar; um
    # perfil que só demonstra o domínio entra com nota de expansão, que é o que
    # ele é.
    matched_function = ", ".join(
        sorted({group_label(index) for index in (role_group_hits or role_group_hits_text)})
    ) or ", ".join(literal_role_hits[:2])
    matched_domain = ", ".join(sorted({group_label(index) for index in domain_group_hits})[:3])

    if function_evidence:
        role_score = min(45.0, 28.0 + best_core_similarity * 17.0)
        title_alignment = (
            f"exerce a função da vaga: {matched_function}"
            if matched_function
            else "título equivalente ao da vaga"
        )
    elif weak_function_evidence and domain_evidence:
        role_score = min(34.0, 18.0 + best_core_similarity * 16.0)
        title_alignment = (
            f"função próxima, domínio confirmado: {matched_domain}"
            if matched_domain
            else "função próxima; domínio confirmado no trecho público"
        )
    elif domain_evidence_count >= 3:
        role_score = min(28.0, 12.0 + min(domain_evidence_count, 6) * 2.5)
        title_alignment = (
            f"cargo com outro nome; domínio da vaga confirmado: {matched_domain}"
            if matched_domain
            else "cargo com outro nome; domínio da vaga confirmado"
        )
    else:
        role_score = min(22.0, best_core_similarity * 30.0)
        title_alignment = "aderência funcional a confirmar no perfil completo"
    if family_conflict and role_score > 30.0:
        # A família divergente não reprova mais, mas continua sendo um alerta:
        # ela desconta a nota e aparece no motivo, para que o recrutador saiba
        # onde olhar antes de abordar.
        role_score -= 4.0
        title_alignment += f" (classificação alternativa: {ROLE_FAMILIES[candidate_family]['label']})"

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

    # TRAVA DE PRECISÃO NO TOPO DA LISTA.
    #
    # Um perfil pode acertar tudo o que se vê dele e ainda assim ser um perfil
    # sobre o qual quase nada se vê. Sem esta trava, o trecho público mais curto
    # tende a produzir a nota mais alta, porque ausência de informação nunca
    # contradiz nada — e o topo da lista passa a ser ocupado por quem tem menos
    # evidência, não por quem tem mais aderência.
    #
    # A nota é então multiplicada pela quantidade de sinais INDEPENDENTES
    # efetivamente confirmados. Quem tem um só sinal não chega ao topo, mesmo
    # que esse sinal esteja correto.
    independent_signals = sum((
        bool(function_evidence),
        bool(domain_evidence),
        bool(candidate_level and seniority_distance is not None and seniority_distance <= 1),
        bool(location_score >= 6.0),
        bool(matches),
        bool(matched_required),
    ))
    confidence_factor = 0.70 + 0.075 * min(4, independent_signals)
    compatibility = round(base_compatibility * confidence_factor)
    confidence, confidence_label = evidence_confidence(candidate_text, independent_signals)

    # ------------------------------------------------------------------ #
    # AJUSTE PELA MEMÓRIA DA VAGA
    #
    # O ajuste precisa acontecer AQUI, e não só na camada TypeScript. Quem
    # escreve a nota final da lista é este motor: um bônus calculado lá seria
    # simplesmente sobrescrito na reavaliação, e o aprendizado do time não
    # apareceria em lugar nenhum. É a mesma classe de erro que fazia os dois
    # motores se anularem antes da Onda 1 — por isso o cálculo mora onde a nota
    # é decidida.
    #
    # Duas travas preservam o critério de precisão:
    # 1. A memória só MOVE quem já é elegível; ela nunca torna elegível quem as
    #    regras reprovaram.
    # 2. O rebaixamento é limitado. Um título já descartado perde pontos e
    #    continua visível — uma decisão pontual não apaga um perfil para sempre.
    # ------------------------------------------------------------------ #
    learned_titles = [str(item) for item in (job.get("learnedTitles") or []) if str(item or "").strip()]
    learned_terms = [str(item) for item in (job.get("learnedTerms") or []) if str(item or "").strip()]
    learned_companies = [str(item) for item in (job.get("learnedCompanies") or []) if str(item or "").strip()]
    demoted_titles = [str(item) for item in (job.get("demotedTitles") or []) if str(item or "").strip()]

    learned_title_hit = next((item for item in learned_titles if phrase_in(normalized_title, item)), "")
    learned_term_hits = [item for item in learned_terms if len(item) > 3 and phrase_in(normalized_candidate, item)]
    learned_company_hit = next(
        (item for item in learned_companies if len(item) > 2 and phrase_in(normalized_candidate, item)), ""
    )
    demoted_hit = next((item for item in demoted_titles if phrase_in(normalized_title, item)), "")

    memory_bonus = min(
        12,
        (6 if learned_title_hit else 0)
        + min(4, len(learned_term_hits) * 2)
        + (3 if learned_company_hit else 0),
    )
    memory_penalty = 10 if demoted_hit else 0
    memory_notes: list[str] = []
    if learned_title_hit:
        memory_notes.append(f"cargo já aprovado pelo time: {learned_title_hit}")
    if learned_term_hits:
        memory_notes.append(f"termos do histórico: {', '.join(learned_term_hits[:3])}")
    if learned_company_hit:
        memory_notes.append(f"empresa de origem recorrente: {learned_company_hit}")
    if demoted_hit:
        memory_notes.append(f"atenção: cargo já descartado antes nesta vaga ({demoted_hit})")
    memory_delta = memory_bonus - memory_penalty
    if eligible and memory_delta:
        compatibility = max(0, min(100, compatibility + memory_delta))

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
    reasons.extend(memory_notes)
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
            "sem evidência pública da função nem do domínio da vaga"
            if not function_eligible else
            "senioridade incompatível com a vaga"
            if not seniority_eligible else
            f"função confirmada ({matched_function}) e senioridade compatível"
            if function_evidence and matched_function else
            "função e senioridade compatíveis"
            if function_evidence else
            f"domínio da vaga confirmado ({matched_domain}); função a validar no perfil"
            if matched_domain else
            "domínio da vaga confirmado; função a validar no perfil"
        ),
        "evidenceSignals": independent_signals,
        "memoryNotes": memory_notes,
        "functionEvidence": sorted({group_label(index) for index in (role_group_hits or role_group_hits_text)}),
        "domainEvidence": sorted({group_label(index) for index in domain_group_hits})[:6],
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
            "memoria": memory_delta,
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
        # Enviados à camada TypeScript para que os dois motores julguem sobre o
        # MESMO vocabulário. Enquanto cada um mantinha a própria lista, um
        # aprovava o que o outro reprovava.
        "roleCore": list(intelligence.role_core),
        "domainTerms": list(intelligence.domain_terms),
        # Domínio agrupado por CONCEITO, não por termo. A camada TypeScript
        # precisa contar quantos conceitos distintos o perfil confirma; uma
        # lista plana faria "bovino" e "beef" contarem como duas evidências
        # quando são a mesma.
        "domainConcepts": [list(group) for group in intelligence.domain_concepts],
        # Termos de hierarquia da vaga nos três idiomas. A camada de busca os
        # combina com o núcleo funcional numa consulta só, em vez de tentar
        # adivinhar a ordem das palavras do título em cada idioma.
        "levelTerms": (
            [term for language in ("pt", "en", "es") for term in LEVELS[intelligence.level][language]]
            if intelligence.level else []
        ),
        "languages": ["pt", "en", "es"],
    }
