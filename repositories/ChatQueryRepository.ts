import { QueryIntent, QueryFilters, QueryResult } from "../services/llm/types"
import { db as prisma } from "../app/lib/prisma"

export function buildWhereClause(
  filters: QueryFilters,
  entity: QueryIntent["entity"]
): Record<string, unknown> {
  const where: Record<string, unknown> = {}

  if (filters.phase !== undefined) {
    where.phase = { contains: filters.phase, mode: "insensitive" }
  }

  if (filters.therapeuticArea !== undefined && entity === "Program") {
    where.therapeuticArea = { contains: filters.therapeuticArea, mode: "insensitive" }
  }

  if (filters.status !== undefined) {
    where.status = { contains: filters.status, mode: "insensitive" }
  }

  if (filters.nameContains !== undefined) {
    where.name = { contains: filters.nameContains, mode: "insensitive" }
  }

  if (filters.programId !== undefined && entity !== "Program") {
    where.programId = filters.programId
  }

  if (filters.dateRange !== undefined && entity === "Milestone") {
    where.targetDate = {
      ...(filters.dateRange.from !== undefined ? { gte: new Date(filters.dateRange.from) } : {}),
      ...(filters.dateRange.to !== undefined ? { lte: new Date(filters.dateRange.to) } : {}),
    }
  }

  return where
}

export async function executeQuery(intent: QueryIntent): Promise<QueryResult> {
  const where = buildWhereClause(intent.filters, intent.entity)
  const take = Math.min(intent.limit ?? 20, 50)

  if (intent.entity === "Program") {
    const rows = await prisma.program.findMany({
      where,
      include: { studies: true, milestones: true },
      take,
    })
    const totalCount = await prisma.program.count({ where })
    return { entity: intent.entity, rows: rows as Record<string, unknown>[], totalCount }
  }

  if (intent.entity === "Study") {
    const rows = await prisma.study.findMany({ where, take })
    const totalCount = await prisma.study.count({ where })
    return { entity: intent.entity, rows: rows as Record<string, unknown>[], totalCount }
  }

  if (intent.entity === "Milestone") {
    const rows = await prisma.milestone.findMany({ where, take })
    const totalCount = await prisma.milestone.count({ where })
    return { entity: intent.entity, rows: rows as Record<string, unknown>[], totalCount }
  }

  // "mixed" — query all three with per-model cap of 10
  const [programs, studies, milestones] = await Promise.all([
    prisma.program.findMany({ where: {}, take: 10 }),
    prisma.study.findMany({ where: {}, take: 10 }),
    prisma.milestone.findMany({ where: {}, take: 10 }),
  ])
  const rows = [
    ...programs,
    ...studies,
    ...milestones,
  ] as Record<string, unknown>[]
  return { entity: intent.entity, rows, totalCount: rows.length }
}
