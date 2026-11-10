import "server-only";
import { prisma } from "@/lib/prisma";
import { createOpenAIFactGenerator } from "./openai-generator";
import { createPrismaFactRepository } from "./prisma-repository";
import { getFactForUser } from "./service";

const repo = createPrismaFactRepository(prisma);
const generator = createOpenAIFactGenerator();

export function getFact(userId: string) {
  return getFactForUser(userId, { repo, generator });
}
