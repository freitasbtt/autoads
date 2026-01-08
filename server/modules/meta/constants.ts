import type { ObjectiveResultRule } from "./types";

export const GRAPH_BASE_URL = "https://graph.facebook.com/v24.0";

export const LEAD_ACTION_TYPES = new Set([
  "lead",
  "leadgen",
  "leadgen.other",
  "leadgen_qualified_lead",
  "leadgen.qualified_lead",
  "omni_lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.lead",
  "onsite_conversion.post_save",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
  "offsite_content_view_add_meta_leads",
  "submit_application",
  "submitted_application",
  "contact",
]);

export const DEFAULT_ATTRIBUTION_WINDOWS = [
  "7d_click",
  "1d_click",
  "7d_view",
  "1d_view",
] as const;

export const ACTION_TYPE_LABELS: Record<string, string> = {
  lead: "Leads",
  leadgen: "Leads",
  "leadgen.other": "Leads",
  "leadgen_qualified_lead": "Leads qualificados",
  "leadgen.qualified_lead": "Leads qualificados",
  omni_lead: "Leads Omni",
  "onsite_conversion.lead_grouped": "Leads",
  "onsite_conversion.lead": "Leads",
  "onsite_conversion.post_save": "Salvos",
  "offsite_conversion.fb_pixel_lead": "Leads (pixel)",
  onsite_web_lead: "Leads (site)",
  offsite_content_view_add_meta_leads: "Meta Leads",
  submit_application: "Envios de cadastro",
  submitted_application: "Cadastros enviados",
  contact: "Contatos",

  "onsite_conversion.whatsapp_message": "Conversas no WhatsApp",
  "onsite_conversion.whatsapp_first_reply": "Respostas no WhatsApp",
  "onsite_conversion.whatsapp_inbox_reply": "Respostas no WhatsApp",
  whatsapp_link_click: "Cliques para WhatsApp",
  whatsapp_conversion: "Conversas no WhatsApp",
  "onsite_conversion.messaging_first_reply": "Conversas por mensagem",
  "onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas",
  "onsite_conversion.total_messaging_connection": "Conexoes por mensagem",
  messaging_conversation_started_7d: "Conversas iniciadas",
  messaging_connection: "Conexoes por mensagem",
  "onsite_conversion.messaging_total_conversation_starters": "Conversas por mensagem",
  messages_sent: "Mensagens enviadas",
  messaging_new_conversation: "Conversas iniciadas",
  omni_opt_in: "Opt-ins",
  omni_primary_message: "Mensagens principais",

  purchase: "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras (pixel)",
  initiate_checkout: "Inicios de checkout",
  checkout_initiated: "Inicios de checkout",
  add_to_cart: "Adicoes ao carrinho",
  add_payment_info: "Informacoes de pagamento",
  add_to_wishlist: "Adicoes a lista de desejos",
  conversion: "Conversoes",
  website_conversion: "Conversoes no site",
  complete_registration: "Cadastros concluidos",
  registration: "Cadastros",
  start_trial: "Inicios de teste",
  subscribe: "Assinaturas",
  schedule: "Agendamentos",

  link_click: "Cliques no link",
  outbound_click: "Cliques de saida",
  landing_page_view: "Visualizacoes da pagina de destino",
  view_content: "Visualizacoes de conteudo",
};

export const OPTIMIZATION_GOAL_ALIASES: Record<string, string> = {
  OFFSITE_CONVERSIONS: "PURCHASE",
  CONVERSIONS: "PURCHASE",
  PURCHASE_CONVERSIONS: "PURCHASE",
  VALUE: "PURCHASE",

  OUTCOME_LEADS: "LEAD_GENERATION",
  OUTCOME_LEAD_GENERATION: "LEAD_GENERATION",
  LEADS: "LEAD_GENERATION",
  LEAD: "LEAD_GENERATION",
  LEAD_GENERATION: "LEAD_GENERATION",

  OUTCOME_MESSAGES: "MESSAGES",
  MESSAGING_APPOINTMENT_CONVERSION: "MESSAGES",
  MESSAGING_PURCHASE_CONVERSION: "MESSAGES",
  CONVERSATIONS: "MESSAGES",
  WHATSAPP_MESSAGE: "MESSAGES",
  REPLIES: "MESSAGES",
  MESSAGES: "MESSAGES",

  OUTCOME_SALES: "OUTCOME_SALES",
  SALES: "OUTCOME_SALES",

  OUTCOME_PURCHASE: "PURCHASE",
  PURCHASES: "PURCHASE",
  PURCHASE: "PURCHASE",

  OUTCOME_TRAFFIC: "LANDING_PAGE_VIEWS",
  TRAFFIC: "LANDING_PAGE_VIEWS",
  LANDING_PAGE_VIEWS: "LANDING_PAGE_VIEWS",

  LINK_CLICKS: "LINK_CLICKS",

  OUTCOME_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  POST_ENGAGEMENT: "POST_ENGAGEMENT",

  BRAND_AWARENESS: "BRAND_AWARENESS",
  OUTCOME_AWARENESS: "BRAND_AWARENESS",
  AWARENESS: "BRAND_AWARENESS",
};

export const OPTIMIZATION_GOAL_TO_ACTION_TYPES: Record<string, string[]> = {
  BRAND_AWARENESS: ["impressions", "reach"],
  LEAD_GENERATION: [
    "lead",
    "leadgen",
    "leadgen.other",
    "leadgen_qualified_lead",
    "leadgen.qualified_lead",
    "omni_lead",
    "onsite_conversion.lead",
    "onsite_conversion.lead_grouped",
    "onsite_conversion.post_save",
    "offsite_conversion.fb_pixel_lead",
    "onsite_web_lead",
    "offsite_content_view_add_meta_leads",
  ],
  MESSAGES: [
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started_7d",
    "onsite_conversion.messaging_total_conversation_starters",
    "onsite_conversion.total_messaging_connection",
    "onsite_conversion.messaging_first_reply_conversation",
    "onsite_conversion.whatsapp_first_reply",
    "whatsapp_conversion",
    "onsite_conversion.whatsapp_message",
  ],
  PURCHASE: ["purchase", "offsite_conversion.fb_pixel_purchase", "conversion"],
  LANDING_PAGE_VIEWS: ["landing_page_view", "omni_landing_page_view", "view_content"],
  LINK_CLICKS: ["link_click", "outbound_click"],
  POST_ENGAGEMENT: ["post_engagement", "page_engagement", "post_interaction_gross"],
  OUTCOME_ENGAGEMENT: ["post_engagement", "page_engagement", "post_interaction_gross"],
  OUTCOME_REACH: ["impressions", "reach"],
  OUTCOME_SALES: [
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "offsite_content_view_add_meta_leads",
    "view_content",
    "initiate_checkout",
    "checkout_initiated",
    "add_to_cart",
  ],
  OUTCOME_TRAFFIC: ["landing_page_view", "omni_landing_page_view", "link_click", "outbound_click"],
};

export const FALLBACK_RESULT_ACTION_TYPES: string[] = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "value",
  "lead",
  "leadgen",
  "onsite_conversion.messaging_first_reply",
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
  "messaging_conversation_started_7d",
  "messaging_connection",
  "landing_page_view",
  "omni_landing_page_view",
  "link_click",
  "outbound_click",
  "post_engagement",
  "page_engagement",
  "view_content",
  "onsite_web_lead",
  "offsite_content_view_add_meta_leads",
];

const LEAD_RESULT_ACTION_TYPES = [
  "lead",
  "leadgen",
  "leadgen.other",
  "onsite_conversion.lead",
  "onsite_web_lead",
  "offsite_conversion.fb_pixel_lead",
];

const MESSAGE_RESULT_ACTION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
];

const SALES_RESULT_ACTION_TYPES = ["purchase", "offsite_conversion.fb_pixel_purchase"];

export const OBJECTIVE_RESULT_RULES: Record<string, ObjectiveResultRule> = {
  OUTCOME_LEADS: {
    label: "Leads",
    actionTypes: LEAD_RESULT_ACTION_TYPES,
    mode: "first",
  },
  LEAD_GENERATION: {
    label: "Leads",
    actionTypes: LEAD_RESULT_ACTION_TYPES,
    mode: "first",
  },
  OUTCOME_ENGAGEMENT: {
    label: "Conversas iniciadas",
    actionTypes: MESSAGE_RESULT_ACTION_TYPES,
    mode: "first",
  },
  ENGAGEMENT: {
    label: "Conversas iniciadas",
    actionTypes: MESSAGE_RESULT_ACTION_TYPES,
    mode: "first",
  },
  MESSAGES: {
    label: "Conversas iniciadas",
    actionTypes: MESSAGE_RESULT_ACTION_TYPES,
    mode: "first",
  },
  OUTCOME_SALES: {
    label: "Vendas",
    actionTypes: SALES_RESULT_ACTION_TYPES,
    mode: "first",
  },
  PURCHASE: {
    label: "Vendas",
    actionTypes: SALES_RESULT_ACTION_TYPES,
    mode: "first",
  },
};

export const CAMPAIGN_OBJECTIVE_ALIASES: Record<string, string> = {
  OUTCOME_LEAD_GENERATION: "OUTCOME_LEADS",
  OUTCOME_LEADS: "OUTCOME_LEADS",
  LEADS: "OUTCOME_LEADS",
  LEAD: "OUTCOME_LEADS",
  LEAD_GENERATION: "LEAD_GENERATION",

  OUTCOME_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  ENGAGEMENT: "ENGAGEMENT",

  OUTCOME_MESSAGES: "MESSAGES",
  MESSENGER: "MESSAGES",
  MESSAGING: "MESSAGES",
  MESSAGES: "MESSAGES",

  OUTCOME_SALES: "OUTCOME_SALES",
  SALES: "OUTCOME_SALES",
  OUTCOME_PURCHASE: "OUTCOME_SALES",
  PURCHASE: "PURCHASE",
};
