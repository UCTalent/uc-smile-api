export type Intent = "FAQ" | "GENERAL_SAFE" | "RISKY" | "OUT_OF_SCOPE" | "GREETING";

export type ResponseLanguage = "vi" | "en";

export type SubQuestion = {
  text: string;
  intent: Intent;
  searchQuery: string;
};

export type ClassifiedIntent = {
  subQuestions: SubQuestion[];
  responseLanguage: ResponseLanguage;
};
