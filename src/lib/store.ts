import { promises as fs } from "node:fs";
import path from "node:path";
import { AppState, Artifact, ChatMessage, UploadedFile, WorkspaceContext } from "@/lib/types";
import { nowIso } from "@/lib/utils";

const dataDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(dataDir, "uploads");
const statePath = path.join(dataDir, "pm-agent-state.json");

const defaultState: AppState = {
  workspace: null,
  uploads: [],
  messages: [],
  artifacts: []
};

async function ensureStore() {
  await fs.mkdir(uploadsDir, { recursive: true });
  try {
    await fs.access(statePath);
  } catch {
    await fs.writeFile(statePath, JSON.stringify(defaultState, null, 2), "utf8");
  }
}

export async function getState(): Promise<AppState> {
  await ensureStore();
  const raw = await fs.readFile(statePath, "utf8");
  try {
    return JSON.parse(raw) as AppState;
  } catch {
    await fs.writeFile(statePath, JSON.stringify(defaultState, null, 2), "utf8");
    return defaultState;
  }
}

export async function writeState(state: AppState) {
  await ensureStore();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  return state;
}

export async function saveWorkspace(workspace: WorkspaceContext) {
  const state = await getState();
  state.workspace = workspace;

  if (state.messages.length === 0) {
    const createdAt = nowIso();
    state.messages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Workspace created. I can now recommend what to build next, draft the MVP discussion doc, turn it into a PRD, and debug metric changes without inventing evidence.",
      createdAt
    });
  }

  return writeState(state);
}

export async function appendMessages(...messages: ChatMessage[]) {
  const state = await getState();
  state.messages.push(...messages);
  return writeState(state);
}

export async function upsertArtifact(artifact: Artifact) {
  const state = await getState();
  const existingIndex = state.artifacts.findIndex((item) => item.id === artifact.id);

  if (existingIndex >= 0) {
    state.artifacts[existingIndex] = artifact;
  } else {
    state.artifacts.unshift(artifact);
  }

  return writeState(state);
}

export async function saveUpload(file: UploadedFile) {
  const state = await getState();
  state.uploads.unshift(file);
  return writeState(state);
}

export async function getArtifact(id: string) {
  const state = await getState();
  return state.artifacts.find((artifact) => artifact.id === id) ?? null;
}

export async function getUploadsDir() {
  await ensureStore();
  return uploadsDir;
}
