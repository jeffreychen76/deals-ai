export type MessageRole = "assistant" | "system" | "user";
export type ArtifactType = "debug-report" | "mvp-doc" | "prd" | "recommendation";
export type ArtifactStatus = "approved" | "draft" | "needs-input";
export type ExportFormat = "docx" | "md" | "pdf";

export interface WorkspaceContext {
  id: string;
  companyName: string;
  teamName: string;
  productName: string;
  productDescription: string;
  targetUsers: string;
  businessGoals: string;
  northStarMetric: string;
  keyMetrics: string;
  currentChallenges: string;
  onboardingNotes: string;
  allowResearch: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  storedName: string;
  mimeType: string;
  kind: "csv" | "docx" | "image" | "other" | "pdf" | "text";
  extractionStatus?: "failed" | "none" | "parsed" | "partial";
  extractedText?: string;
  headings?: string[];
  note?: string;
  preview?: string;
  pageCount?: number;
  size: number;
  uploadedAt: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface RecommendationIdea {
  rank: number;
  title: string;
  summary: string;
  rationale: string;
  expectedImpact: string;
}

export interface Citation {
  title: string;
  kind: "external" | "internal" | "uploaded";
  url?: string;
}

export interface ArtifactMeta {
  winner?: string;
  confidence?: string;
  assumptions?: string[];
  questions?: string[];
  rankedIdeas?: RecommendationIdea[];
  citations?: Citation[];
  partial?: boolean;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  status: ArtifactStatus;
  createdAt: string;
  updatedAt: string;
  meta: ArtifactMeta;
}

export interface AppState {
  workspace: WorkspaceContext | null;
  uploads: UploadedFile[];
  messages: ChatMessage[];
  artifacts: Artifact[];
}
