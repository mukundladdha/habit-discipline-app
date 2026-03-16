const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const defaultHabits = [
  { name: 'Workout', sortOrder: 0 },
  { name: 'No Sugar', sortOrder: 1 },
  { name: '10k Steps', sortOrder: 2 },
  { name: '7+ Hours of Sleep', sortOrder: 3 },
];

async function main() {
  for (const h of defaultHabits) {
    const existing = await prisma.habit.findFirst({ where: { sortOrder: h.sortOrder } });
    if (existing) {
      await prisma.habit.update({
        where: { id: existing.id },
        data: { name: h.name },
      });
    } else {
      await prisma.habit.create({ data: h });
    }
  }
  console.log('Ensured default habits exist.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
