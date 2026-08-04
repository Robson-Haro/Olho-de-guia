export type MarketSegment = {
  value: string;
  label: string;
  searchTerms: string[];
  seedCompanies?: string[];
};

export const MARKET_SEGMENTS: MarketSegment[] = [
  { value: "", label: "Todos os segmentos", searchTerms: [] },
  { value: "beef_processing", label: "Frigorífico bovino", searchTerms: ["frigorífico bovino", "indústria de carne bovina", "beef processing", "meat packing"], seedCompanies: ["Minerva Foods", "JBS", "Marfrig", "Frigol", "Masterboi", "Frisa"] },
  { value: "general_meat", label: "Frigorífico geral", searchTerms: ["frigorífico", "indústria de carnes", "meat processing", "food protein"], seedCompanies: ["JBS", "Minerva Foods", "Marfrig", "BRF", "Aurora Coop", "Frimesa"] },
  { value: "leather_tannery", label: "Couro e curtume", searchTerms: ["indústria de couro", "curtume", "tannery", "leather industry"], seedCompanies: ["JBS Couros", "Vancouros", "Durli Couros", "Courovale", "Viposa", "Luiz Fuga"] },
  { value: "financial_services", label: "Financeiro e serviços bancários", searchTerms: ["serviços financeiros", "banco", "fintech", "financial services"], seedCompanies: ["Itaú Unibanco", "Bradesco", "Santander", "Banco do Brasil", "Nubank", "BTG Pactual"] },
  { value: "retail", label: "Varejo", searchTerms: ["varejo", "rede varejista", "retail", "e-commerce"], seedCompanies: ["Grupo Carrefour Brasil", "Assaí Atacadista", "Magazine Luiza", "Grupo Casas Bahia", "Mercado Livre", "Amazon"] },
  { value: "food_beverage", label: "Alimentos e bebidas", searchTerms: ["indústria de alimentos e bebidas", "food and beverage", "consumer foods"], seedCompanies: ["Nestlé", "Ambev", "PepsiCo", "Coca-Cola", "Danone", "Kraft Heinz"] },
  { value: "agribusiness", label: "Agronegócio", searchTerms: ["agronegócio", "agroindústria", "agribusiness", "agtech"], seedCompanies: ["Bunge", "Cargill", "ADM", "Louis Dreyfus Company", "Raízen", "SLC Agrícola"] },
  { value: "logistics", label: "Logística e transportes", searchTerms: ["logística e transportes", "operador logístico", "logistics", "transportation"], seedCompanies: ["DHL", "JSL", "Rumo", "Localiza", "FedEx", "Maersk"] },
  { value: "technology", label: "Tecnologia e software", searchTerms: ["tecnologia", "software", "SaaS", "information technology"], seedCompanies: ["TOTVS", "IBM", "Microsoft", "Oracle", "SAP", "CI&T"] },
  { value: "pharma_health", label: "Farmacêutico e saúde", searchTerms: ["indústria farmacêutica", "saúde", "pharmaceutical", "healthcare"], seedCompanies: ["Eurofarma", "EMS", "Aché", "Hypera Pharma", "Dasa", "Rede D'Or"] },
  { value: "manufacturing", label: "Indústria e manufatura", searchTerms: ["indústria de transformação", "manufatura", "manufacturing", "industrial"], seedCompanies: ["WEG", "Embraer", "Bosch", "Siemens", "Gerdau", "Votorantim"] },
  { value: "construction", label: "Construção e infraestrutura", searchTerms: ["construção civil", "infraestrutura", "construction", "engineering"], seedCompanies: ["MRV", "Cyrela", "Direcional", "Tenda", "Aegea", "Motiva"] },
  { value: "energy", label: "Energia e combustíveis", searchTerms: ["energia", "óleo e gás", "energy", "oil and gas", "renewable energy"], seedCompanies: ["Petrobras", "Raízen", "Vibra Energia", "Equatorial Energia", "CPFL Energia", "Neoenergia"] },
  { value: "professional_services", label: "Consultoria e serviços profissionais", searchTerms: ["consultoria empresarial", "serviços profissionais", "professional services", "business consulting"], seedCompanies: ["Deloitte", "PwC", "EY", "KPMG", "Accenture", "McKinsey"] },
];

export function getMarketSegment(value: string | undefined) {
  return MARKET_SEGMENTS.find((segment) => segment.value === value) || MARKET_SEGMENTS[0];
}
