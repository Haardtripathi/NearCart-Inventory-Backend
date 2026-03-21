import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { generateUniqueBranchCode } from "../../utils/branchCode";
import { buildPagination, getPagination } from "../../utils/pagination";

export async function listBranches(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    search?: string;
    isActive?: boolean;
  },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where = {
    organizationId,
    deletedAt: null,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { code: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.branch.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.branch.count({ where }),
  ]);

  return {
    items,
    pagination: buildPagination(page, limit, totalItems),
  };
}

export async function createBranch(organizationId: string, input: {
  code?: string; // Optional - auto-generated if not provided
  name: string;
  type: "STORE" | "WAREHOUSE" | "DARK_STORE";
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  isActive?: boolean;
}) {
  // Generate code if not provided
  let code = input.code?.trim();
  
  if (!code) {
    code = await generateUniqueBranchCode(async (candidateCode) => {
      const existing = await prisma.branch.findFirst({
        where: {
          organizationId,
          code: candidateCode,
          deletedAt: null,
        },
      });
      return !!existing;
    });
  }

  return prisma.branch.create({
    data: {
      organizationId,
      code,
      name: input.name.trim(),
      type: input.type,
      phone: input.phone ?? null,
      email: input.email ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      country: input.country ?? null,
      postalCode: input.postalCode ?? null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function getBranchById(organizationId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!branch) {
    throw ApiError.notFound("Branch not found");
  }

  return branch;
}

export async function updateBranch(
  organizationId: string,
  branchId: string,
  input: Partial<{
    code: string;
    name: string;
    type: "STORE" | "WAREHOUSE" | "DARK_STORE";
    phone: string;
    email: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    isActive: boolean;
  }>,
) {
  await getBranchById(organizationId, branchId);

  return prisma.branch.update({
    where: { id: branchId },
    data: {
      ...(input.code ? { code: input.code.trim() } : {}),
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 || null } : {}),
      ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 || null } : {}),
      ...(input.city !== undefined ? { city: input.city || null } : {}),
      ...(input.state !== undefined ? { state: input.state || null } : {}),
      ...(input.country !== undefined ? { country: input.country || null } : {}),
      ...(input.postalCode !== undefined ? { postalCode: input.postalCode || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function deleteBranch(organizationId: string, branchId: string) {
  await getBranchById(organizationId, branchId);

  return prisma.branch.update({
    where: { id: branchId },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });
}
