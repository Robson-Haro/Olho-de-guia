"""Léxico funcional trilíngue do Eureka.

Este módulo substitui a taxonomia fixa de famílias profissionais como mecanismo
de equivalência. A diferença é de natureza, não de tamanho:

- Uma TAXONOMIA classifica. Ela precisa conter a carreira do candidato, e o que
  ela não contém ela julga errado. Era a origem das buscas que voltavam vazias
  para abate, comércio exterior ou trading, e das buscas que aprovavam qualquer
  perfil quando a família não era reconhecida.
- Um LÉXICO traduz. Ele não decide se o candidato serve; ele apenas informa que
  "abate", "slaughter" e "faena" são a mesma coisa. O que ele não cobre continua
  sendo comparado pela grafia original, sem penalidade.

Por isso a ausência de um termo aqui degrada suavemente a busca em vez de
quebrá-la, e acrescentar vocabulário é aditivo e seguro.

O léxico é calculado uma única vez, na interpretação da vaga, e enviado à camada
TypeScript junto com os títulos equivalentes. As duas camadas passam a decidir
sobre o MESMO vocabulário — que era exatamente o que faltava quando cada motor
mantinha a sua própria lista.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Iterable


# Cada linha é um grupo de sinônimos entre português, inglês e espanhol.
# A ordem dentro do grupo não importa; o primeiro termo é usado apenas como
# rótulo legível na auditoria.
SYNONYM_GROUPS: tuple[tuple[str, ...], ...] = (
    # ---------------------------------------------------------------- proteína
    ("abate", "abatedouro", "slaughter", "slaughterhouse", "slaughtering", "faena", "faenamiento"),
    ("frigorifico", "meat plant", "meat packing", "meatpacking", "packing house", "planta frigorifica", "frigorifica"),
    ("carcaca", "carcass", "canal", "media carcaca"),
    ("desossa", "deboning", "boning", "deshuese", "deshuesado"),
    ("bovino", "bovinos", "beef", "cattle", "vacuno", "gado", "bovina"),
    ("suino", "suinos", "pork", "swine", "porcino", "hog"),
    ("aves", "poultry", "frango", "chicken", "avicola", "ave"),
    ("bem estar animal", "animal welfare", "bienestar animal", "welfare"),
    ("rendimento", "yield", "rendimiento"),
    ("resfriamento", "chilling", "cold chain", "cadeia do frio", "refrigeracao", "refrigeration"),
    ("subprodutos", "by products", "byproducts", "rendering", "graxaria", "subproductos"),
    ("couro", "leather", "cuero", "piel", "hide", "wet blue"),
    ("curtume", "tannery", "tanning", "curtiembre", "curtiduria"),
    ("desmembramento", "cutting", "corte", "cutting room", "sala de cortes"),
    ("confinamento", "feedlot", "corral", "engorda"),
    ("pecuaria", "livestock", "ganaderia", "cattle raising"),
    ("originacao", "origination", "compra de gado", "cattle procurement", "originacion"),
    ("nutricao animal", "animal nutrition", "nutricion animal", "formulacao de racoes", "feed formulation", "dieta", "racao", "feed"),
    ("melhoramento genetico", "genetics", "genetica", "breeding", "mejoramiento genetico", "inseminacao artificial", "artificial insemination"),
    ("sanidade animal", "animal health", "sanidad animal", "vacinacao", "vaccination"),
    ("agronomia", "agronomy", "agronomo", "plantio", "lavoura", "crop", "cultivo"),
    ("irrigacao", "irrigation", "riego"),
    # ------------------------------------------------------- qualidade e saúde
    ("qualidade", "quality", "calidad"),
    ("garantia da qualidade", "quality assurance", "aseguramiento de calidad"),
    ("controle de qualidade", "quality control", "control de calidad"),
    ("seguranca dos alimentos", "food safety", "inocuidad alimentaria", "inocuidade"),
    ("haccp", "appcc", "apppc", "analise de perigos"),
    ("boas praticas de fabricacao", "good manufacturing practices", "gmp", "bpf", "buenas practicas"),
    ("inspecao", "inspection", "inspeccion", "sif", "servico de inspecao federal"),
    ("auditoria", "audit", "auditing", "auditoria interna", "internal audit"),
    ("certificacao", "certification", "certificacion", "iso", "brc", "ifs"),
    ("laboratorio", "laboratory", "lab", "laboratorio de analises"),
    ("microbiologia", "microbiology", "microbiologia"),
    ("veterinario", "veterinaria", "veterinarian", "veterinary", "veterinario zootecnista", "crmv"),
    ("zootecnia", "animal science", "zootecnista", "zootecnia"),
    ("responsavel tecnico", "technical manager", "responsable tecnico", "rt"),
    # ------------------------------------------------------ produção e indústria
    ("producao", "production", "produccion", "manufatura", "manufacturing", "manufactura"),
    ("operacoes", "operations", "operaciones", "operacao industrial", "industrial operations"),
    ("processo", "process", "proceso", "processos", "procesos"),
    ("manutencao", "maintenance", "mantenimiento"),
    ("confiabilidade", "reliability", "confiabilidad"),
    ("preditiva", "predictive", "predictiva", "preventiva", "preventive", "preventiva"),
    ("utilidades", "utilities", "utilidades industriais", "caldeira", "boiler", "amonia", "ammonia", "refrigeracao industrial"),
    ("automacao", "automation", "automatizacion", "automacao industrial"),
    ("ferroviario", "railway", "rail", "vagao", "wagon", "locomotiva", "locomotive", "via permanente", "ferrocarril"),
    ("frota", "fleet", "veiculos", "vehicles", "flota", "oficina mecanica"),
    ("metrologia", "metrology", "calibracao", "calibration", "instrumentos de medicao"),
    ("almoxarifado", "storeroom", "spare parts", "pecas de reposicao", "almacen de repuestos"),
    ("caldeiraria", "boilermaking", "solda", "welding", "soldadura"),
    ("embalagem", "packaging", "envase", "rotulagem", "labelling"),
    ("engenharia", "engineering", "ingenieria"),
    ("projetos", "projects", "proyectos", "capex", "project management", "gestao de projetos"),
    ("planejamento e controle da producao", "production planning", "pcp", "planificacion de la produccion"),
    ("lean", "lean manufacturing", "melhoria continua", "continuous improvement", "mejora continua", "kaizen"),
    ("seis sigma", "six sigma", "lean six sigma", "green belt", "black belt"),
    ("excelencia operacional", "operational excellence", "excelencia operacional", "wcm"),
    ("padronizacao", "standardization", "estandarizacion", "sop", "procedimento operacional"),
    ("produtividade", "productivity", "productividad", "oee"),
    ("turno", "shift", "turno de producao"),
    # ------------------------------------------------ segurança e meio ambiente
    ("seguranca do trabalho", "occupational safety", "seguridad laboral", "workplace safety", "sst"),
    ("saude ocupacional", "occupational health", "salud ocupacional", "medicina do trabalho"),
    ("ehs", "hse", "sso", "sms", "health safety environment", "seguranca saude e meio ambiente"),
    ("meio ambiente", "environment", "environmental", "medio ambiente", "ambiental"),
    ("sustentabilidade", "sustainability", "sostenibilidad", "esg"),
    ("licenciamento ambiental", "environmental licensing", "licenciamiento ambiental", "licenca ambiental"),
    ("efluentes", "effluent", "wastewater", "eta", "ete", "tratamento de efluentes", "efluentes industriais"),
    ("residuos", "waste", "residuos solidos", "waste management", "gestao de residuos"),
    ("outorga", "water permit", "recursos hidricos", "water resources"),
    ("emissoes", "emissions", "emisiones", "carbono", "carbon", "gee", "ghg"),
    ("rastreabilidade", "traceability", "trazabilidad", "desmatamento", "deforestation"),
    ("norma regulamentadora", "nr", "nr 36", "nr36", "nr 12", "nr 35", "cipa", "pgr", "pcmso"),
    ("ergonomia", "ergonomics", "ergonomia"),
    ("enfermagem", "nursing", "enfermeiro", "enfermeira", "nurse", "enfermeria", "ambulatorio", "clinic"),
    ("exames ocupacionais", "occupational exams", "aso", "exames periodicos", "periodic exams"),
    ("fisioterapia", "physiotherapy", "fisioterapeuta", "physical therapy"),
    ("brigada", "emergency response", "brigada de emergencia", "combate a incendio"),
    # --------------------------------------------------- logística e suprimentos
    # Logística e supply chain são tratadas como a mesma função: no mercado
    # industrial brasileiro os dois títulos concorrem à mesma vaga, e mantê-las
    # separadas fazia um "Gerente de Supply Chain" ser descartado numa vaga de
    # "Gerente de Logística".
    ("logistica", "logistics", "cadeia de suprimentos", "supply chain", "cadena de suministro", "scm"),
    ("armazenagem", "warehousing", "almacenamiento", "armazem", "warehouse", "cd", "centro de distribuicao"),
    ("estoque", "inventory", "inventario", "gestao de estoque", "stock"),
    ("transporte", "transportation", "transportes", "frete", "freight", "transporte rodoviario"),
    ("expedicao", "shipping", "outbound", "despacho", "expedicion"),
    ("recebimento", "inbound", "receiving", "recepcion"),
    ("roteirizacao", "routing", "route planning", "ruteo"),
    ("compras", "procurement", "purchasing", "sourcing", "abastecimento", "adquisiciones"),
    ("suprimentos", "supplies", "supply", "suministros"),
    ("fornecedor", "supplier", "vendor", "proveedor", "homologacao de fornecedores"),
    ("negociacao", "negotiation", "negociacion"),
    ("contrato", "contract", "contratos", "contract management", "gestion de contratos"),
    ("saving", "savings", "cost reduction", "reducao de custos", "ahorro"),
    ("importacao", "import", "importacion", "importacao e exportacao"),
    ("exportacao", "export", "exportacion", "exports"),
    ("comercio exterior", "foreign trade", "international trade", "comercio internacional", "comex"),
    ("despacho aduaneiro", "customs", "customs clearance", "aduana", "aduanero", "desembaraco aduaneiro"),
    ("drawback", "regime aduaneiro", "special customs regime"),
    ("habilitacao de plantas", "plant approval", "habilitacion de plantas", "certificado sanitario", "health certificate"),
    ("armador", "shipping line", "naviera", "booking", "container", "conteiner"),
    ("incoterms", "incoterm", "fob", "cif"),
    # -------------------------------------------------- comercial e mercado
    ("comercial", "commercial", "sales", "vendas", "ventas"),
    ("trading", "trader", "commodities", "commodity", "mesa de operacoes"),
    ("desenvolvimento de negocios", "business development", "desarrollo de negocios"),
    ("key account", "gerente de contas", "account manager", "grandes contas"),
    ("distribuicao", "distribution", "distribucion", "canal", "channel"),
    ("trade marketing", "sell out", "execucao no ponto de venda"),
    ("marketing", "mercadeo", "branding", "marca", "brand"),
    ("precificacao", "pricing", "precios", "revenue management", "gestao de receita"),
    ("margem", "margin", "margen", "rentabilidade", "profitability", "rentabilidad"),
    ("crm", "salesforce", "gestao de clientes", "customer relationship"),
    ("exportacao de carnes", "meat export", "protein export", "exportacion de carne"),
    ("hedge", "hedging", "derivativos", "derivatives", "cobertura cambial"),
    # ------------------------------------------------- financeiro e controle
    ("financeiro", "finance", "financiero", "financial"),
    ("controladoria", "controllership", "controlling", "control de gestion", "controller"),
    ("contabilidade", "accounting", "contabilidad", "contador"),
    ("fiscal", "tax", "tributario", "taxation", "impuestos"),
    ("planejamento financeiro", "financial planning", "fpa", "fp a", "planificacion financiera"),
    ("orcamento", "budget", "budgeting", "presupuesto", "forecast", "previsao"),
    ("tesouraria", "treasury", "tesoreria", "cash management", "fluxo de caixa"),
    ("custos", "costing", "cost accounting", "costos", "custo industrial"),
    ("auditoria interna", "internal audit", "compliance", "conformidade", "controles internos", "sox"),
    ("credito e cobranca", "credit and collection", "credito y cobranza", "recebiveis", "receivables"),
    ("contas a pagar", "accounts payable", "cuentas por pagar"),
    ("ifrs", "gaap", "normas contabeis", "accounting standards"),
    ("sped", "icms", "pis", "cofins", "apuracao", "obrigacoes acessorias"),
    ("relacoes com investidores", "investor relations", "ri", "relaciones con inversores"),
    ("ativo imobilizado", "fixed assets", "gestao patrimonial", "patrimonio", "activo fijo", "inventario de bens"),
    ("atuarial", "actuarial", "atuaria", "reservas tecnicas", "technical reserves", "sinistralidade"),
    ("seguros", "insurance", "seguros corporativos", "apolice", "policy", "corretagem"),
    ("cobranca", "collections", "cobranza", "recuperacao de credito"),
    # ------------------------------------------------------ pessoas e gestão
    ("recursos humanos", "human resources", "rh", "hr", "gente e gestao", "people", "pessoas", "capital humano"),
    ("recrutamento", "recruiting", "recruitment", "reclutamiento", "selecao", "selection", "seleccion"),
    ("atracao de talentos", "talent acquisition", "atraccion de talento", "sourcing de talentos", "hunting"),
    ("remuneracao", "compensation", "rewards", "compensacion", "total rewards", "cargos e salarios"),
    ("beneficios", "benefits", "beneficios corporativos"),
    ("folha de pagamento", "payroll", "nomina", "departamento pessoal", "administracao de pessoal"),
    ("relacoes trabalhistas", "labor relations", "employee relations", "relaciones laborales", "sindical", "union"),
    ("treinamento", "training", "capacitacion", "desenvolvimento", "development", "learning", "aprendizagem"),
    ("business partner", "hrbp", "parceiro de negocio", "people partner", "socio estrategico"),
    ("clima organizacional", "engagement", "engajamento", "clima laboral", "cultura", "culture"),
    ("desempenho", "performance", "desempeno", "avaliacao de desempenho", "performance management"),
    ("saude e seguranca", "health and safety", "salud y seguridad"),
    ("diversidade", "diversity", "diversidad", "inclusao", "inclusion", "dei"),
    ("turnover", "attrition", "rotatividade", "retencao", "retention"),
    ("headcount", "quadro de pessoal", "workforce", "forca de trabalho", "planilla"),
    ("employer branding", "marca empregadora", "marca empleadora"),
    # ------------------------------------------------- dados e tecnologia
    ("dados", "data", "datos"),
    ("analytics", "analise de dados", "data analysis", "analitica"),
    ("business intelligence", "bi", "inteligencia de negocios", "power bi", "tableau", "qlik"),
    ("ciencia de dados", "data science", "ciencia de datos", "machine learning", "aprendizado de maquina"),
    ("engenharia de dados", "data engineering", "ingenieria de datos", "etl", "pipeline de dados"),
    ("tecnologia da informacao", "information technology", "ti", "it", "tecnologia de la informacion"),
    ("desenvolvimento de software", "software development", "desarrollo de software", "desenvolvedor", "developer"),
    ("infraestrutura", "infrastructure", "infraestructura", "redes", "network", "cloud", "nuvem"),
    ("seguranca da informacao", "information security", "cybersecurity", "seguridad de la informacion"),
    ("erp", "sap", "totvs", "protheus", "oracle", "s4hana"),
    ("automacao industrial", "industrial automation", "clp", "plc", "scada", "instrumentacao", "instrumentation"),
    ("projeto de sistemas", "systems analysis", "analise de sistemas", "analista de sistemas"),
    # --------------------------------------------------- jurídico e institucional
    ("juridico", "legal", "advogado", "lawyer", "attorney", "abogado"),
    ("societario", "corporate law", "societario e contratos", "governanca", "governance"),
    ("trabalhista", "labor law", "derecho laboral", "contencioso", "litigation"),
    ("regulatorio", "regulatory", "regulatorio", "assuntos regulatorios", "regulatory affairs"),
    ("relacoes institucionais", "government affairs", "relaciones institucionales", "relacoes governamentais"),
    ("facilities", "servicos gerais", "predial", "administracao predial", "servicios generales"),
    ("atendimento ao cliente", "customer service", "customer experience", "sac", "atencion al cliente"),
    ("escritorio de projetos", "pmo", "project management office", "portfolio de projetos"),
    ("comunicacao", "communication", "comunicacion", "assessoria de imprensa", "public relations"),
    # ----------------------------------------------------------- transversais
    ("gestao de pessoas", "people management", "gestion de personas", "lideranca de equipe", "team management"),
    ("lideranca", "leadership", "liderazgo"),
    ("estrategia", "strategy", "estrategia", "planejamento estrategico", "strategic planning"),
    ("indicadores", "kpi", "kpis", "metrics", "metricas", "indicadores de desempenho"),
    ("multinacional", "multinational", "multinacional", "global", "internacional", "international"),
    ("america latina", "latam", "latin america", "mercosul", "mercosur"),
    ("industria de alimentos", "food industry", "industria alimenticia", "alimentos", "food"),
    ("agronegocio", "agribusiness", "agroindustria", "agro", "agroindustrial"),
    ("varejo", "retail", "minorista"),
    ("atacado", "wholesale", "mayorista", "food service", "foodservice"),
)


def _strip_accents(value: str) -> str:
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _key(value: str) -> str:
    import re

    text = _strip_accents(str(value or "")).lower().replace("&", " e ")
    return re.sub(r"[^a-z0-9+#]+", " ", text).strip()


# Índice termo → identificador do grupo. Um mesmo termo pode pertencer a mais de
# um grupo (por exemplo "auditoria", que é qualidade e também controladoria):
# nesse caso ele carrega os dois, e a evidência conta para ambos.
_TERM_TO_GROUPS: dict[str, tuple[int, ...]] = {}
for _index, _group in enumerate(SYNONYM_GROUPS):
    for _term in _group:
        _normalized = _key(_term)
        if not _normalized:
            continue
        _TERM_TO_GROUPS[_normalized] = (*_TERM_TO_GROUPS.get(_normalized, ()), _index)

MAX_TERM_WORDS = max(len(term.split()) for term in _TERM_TO_GROUPS)


@lru_cache(maxsize=8_000)
def groups_for_term(term: str) -> tuple[int, ...]:
    """Grupos de sinônimos aos quais um termo pertence. Vazio se desconhecido."""
    return _TERM_TO_GROUPS.get(_key(term), ())


def groups_in_text(text: str) -> set[int]:
    """Todos os grupos de sinônimos presentes num texto livre.

    Percorre janelas de 1 a MAX_TERM_WORDS palavras para reconhecer também as
    expressões compostas ("bem estar animal", "comercio exterior").
    """
    words = _key(text).split()
    found: set[int] = set()
    for start in range(len(words)):
        for size in range(1, min(MAX_TERM_WORDS, len(words) - start) + 1):
            window = " ".join(words[start:start + size])
            found.update(_TERM_TO_GROUPS.get(window, ()))
    return found


def expand(terms: Iterable[str], limit: int = 120) -> list[str]:
    """Devolve os termos informados acrescidos de todos os seus sinônimos.

    Termos fora do léxico são preservados como vieram — a cobertura incompleta
    reduz o alcance da tradução, nunca elimina o termo do recrutador.
    """
    result: list[str] = []
    seen: set[str] = set()
    groups: set[int] = set()

    def add(value: str) -> None:
        normalized = _key(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)

    for term in terms:
        normalized = _key(term)
        if not normalized:
            continue
        add(normalized)
        groups.update(_TERM_TO_GROUPS.get(normalized, ()))
    for index in sorted(groups):
        for synonym in SYNONYM_GROUPS[index]:
            add(synonym)
    return result[:limit]


def group_label(index: int) -> str:
    return SYNONYM_GROUPS[index][0]


# Áreas GUARDA-CHUVA. Elas dizem em que diretoria a pessoa trabalha, não o que
# ela faz. Numa vaga de "Business Partner de RH", o núcleo funcional é
# "business partner" e "RH" é apenas o contexto — sem esta distinção, qualquer
# Gerente de Recursos Humanos seria lido como exercendo a mesma função.
# Regra: quando o título traz alguma função específica, o guarda-chuva é
# descartado; quando o título só traz o guarda-chuva, ele é a função.
UMBRELLA_LABELS = (
    "recursos humanos", "financeiro", "comercial", "dados",
    "tecnologia da informacao", "juridico", "operacoes",
    "industria de alimentos", "agronegocio", "varejo", "atacado",
    # Matéria-prima e espécie também são contexto, não função. Em "Especialista
    # em Genética Bovina", a função é genética e "bovina" diz sobre o quê — sem
    # esta linha, um Especialista em Compra de Gado era lido como exercendo a
    # mesma função.
    "bovino", "suino", "aves", "pecuaria", "couro",
)

# Substantivos comuns que aparecem em títulos de cargo sem dizer nada sobre a
# função. Quando o léxico não conhece um termo do título, ele é comparado pela
# grafia — e um termo como "trabalho" casa com metade do mercado. Em
# "Enfermeiro do Trabalho", "trabalho" fazia um Técnico de Segurança do
# Trabalho ser lido como exercendo a mesma função.
WEAK_TITLE_NOUNS = frozenset({
    "trabalho", "trabalhos", "geral", "gerais", "negocio", "negocios",
    "empresa", "empresarial", "corporativo", "corporativa", "area", "areas",
    "unidade", "unidades", "planta", "plantas", "campo", "sistema", "sistemas",
    "servico", "servicos", "produto", "produtos", "central", "nacional",
    "regional", "interno", "interna", "externo", "externa", "novo", "nova",
    "senior", "junior", "pleno", "trainee", "tecnico", "tecnica",
})

# Vocabulário TRANSVERSAL. Aparece em quase toda descrição de vaga de gestão e
# por isso não prova domínio nenhum: sem esta trava, dois perfis de carreiras
# opostas "confirmam o domínio" um do outro por compartilharem liderança e
# indicadores.
TRANSVERSAL_LABELS = (
    "lideranca", "estrategia", "indicadores", "gestao de pessoas",
    "multinacional", "america latina", "projetos", "negociacao",
    "contrato", "processo", "desempenho", "comunicacao",
)


def _labels_to_groups(labels: Iterable[str]) -> frozenset[int]:
    return frozenset(index for label in labels for index in _TERM_TO_GROUPS.get(_key(label), ()))


UMBRELLA_GROUPS = _labels_to_groups(UMBRELLA_LABELS)
TRANSVERSAL_GROUPS = _labels_to_groups(TRANSVERSAL_LABELS)


def specific_groups(groups: Iterable[int], has_specific_literal: bool = False) -> frozenset[int]:
    """Descarta guarda-chuvas quando há alguma função específica no conjunto.

    `has_specific_literal` cobre o caso em que a função do título não está no
    léxico — "Especialista em Genética Bovina", onde "genética" é literal e
    "bovina" é guarda-chuva. Sem esse sinal, o guarda-chuva sobreviveria por
    ser o único grupo reconhecido e passaria a valer como função.
    """
    collected = frozenset(groups)
    specific = collected - UMBRELLA_GROUPS
    if specific:
        return specific
    return frozenset() if has_specific_literal else collected


def is_weak_title_noun(term: str) -> bool:
    """Termo de título comum demais para provar função sozinho."""
    normalized = _key(term)
    return not normalized or len(normalized) < 5 or normalized in WEAK_TITLE_NOUNS


def evidence_groups(groups: Iterable[int]) -> frozenset[int]:
    """Grupos que podem servir de prova de domínio: sem guarda-chuva, sem transversais."""
    return frozenset(groups) - UMBRELLA_GROUPS - TRANSVERSAL_GROUPS
