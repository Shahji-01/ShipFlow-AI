import { PrismaClient, WorkspaceRole, BillingTier } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create test user
  const user = await prisma.user.upsert({
    where: { email: "admin@shipflow.dev" },
    update: {},
    create: {
      email: "admin@shipflow.dev",
      name: "ShipFlow Admin",
      emailVerified: true,
    },
  });
  console.log(`✅ Created user: ${user.email}`);

  // Create test workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: "shipflow-dev" },
    update: {},
    create: {
      name: "ShipFlow Dev",
      slug: "shipflow-dev",
    },
  });
  console.log(`✅ Created workspace: ${workspace.name}`);

  // Add user as ADMIN member of workspace
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.ADMIN,
    },
  });
  console.log(`✅ Added ${user.email} as ADMIN of ${workspace.name}`);

  // Create sample project
  const project = await prisma.project.upsert({
    where: {
      id: "seed-project-001",
    },
    update: {},
    create: {
      id: "seed-project-001",
      workspaceId: workspace.id,
      name: "Sample Project",
      description: "A sample project for development and testing",
    },
  });
  console.log(`✅ Created project: ${project.name}`);

  // Set up Free tier billing subscription
  const billingCycleStart = new Date();
  const billingCycleEnd = new Date();
  billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);

  await prisma.billingSubscription.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      tier: BillingTier.FREE,
      aiReviewCredits: 10,
      maxRepositories: 2,
      billingCycleStart,
      billingCycleEnd,
    },
  });
  console.log(`✅ Set up FREE tier billing for ${workspace.name}`);

  console.log("\n🎉 Seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seeding failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
