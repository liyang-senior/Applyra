import { NextResponse } from "next/server";
import { AVAILABLE_MODELS, getDefaultModel } from "@/lib/ai/models";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import {
  getConfiguredProviders,
  providerLabel,
  resolveDefaultProvider,
  type AiProvider,
} from "@/lib/ai/providers";

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  const available = getConfiguredProviders();
  const defaultProvider = resolveDefaultProvider();
  const order: AiProvider[] = ["openai", "claude", "deepseek", "chatgpt"];
  const options = order.map((id) => ({
    id,
    label: providerLabel(id),
    available: available[id],
    models: ((AVAILABLE_MODELS as Record<string, Array<{ id: string; name: string }>>)[
      id
    ] || []).map((model) => ({
      id: model.id,
      name: model.name,
    })),
    defaultModel: getDefaultModel(id),
  }));

  return NextResponse.json({
    defaultProvider,
    defaultModel: getDefaultModel(defaultProvider),
    available,
    options,
  });
}
