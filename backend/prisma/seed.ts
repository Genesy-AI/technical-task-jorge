import { Prisma, PrismaClient } from '@prisma/client'

// Sample leads that shipped in the originally committed dev.db.
// Only contact data is seeded: enrichment fields (verification, phone, message) start empty.
const SAMPLE_LEADS: Prisma.leadCreateManyInput[] = [
  {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    jobTitle: 'Software Engineer',
    countryCode: 'US',
    companyName: 'TechCorp',
  },
  {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
    jobTitle: 'Marketing Manager',
    countryCode: 'CA',
    companyName: 'MarketInc',
  },
  {
    firstName: 'Emily',
    lastName: 'Johnson',
    email: 'emily.johnson@example.com',
    jobTitle: 'HR Specialist',
    countryCode: 'UK',
    companyName: 'HR Solutions',
  },
  {
    firstName: 'Michael',
    lastName: 'Brown',
    email: 'michael.brown@example.com',
    jobTitle: 'Sales Executive',
    countryCode: 'AU',
    companyName: 'SalesPlus',
  },
  {
    firstName: 'Jessica',
    lastName: 'Williams',
    email: 'jessica.williams@example.com',
    jobTitle: 'Product Manager',
    countryCode: 'DE',
    companyName: 'ProdManage',
  },
  {
    firstName: 'David',
    lastName: 'Miller',
    email: 'david.miller@example.com',
    jobTitle: 'CTO',
    countryCode: 'IN',
    companyName: 'Tech Innovations',
  },
  {
    firstName: 'Sarah',
    lastName: 'Davis',
    email: 'sarah.davis@example.com',
    jobTitle: 'Finance Analyst',
    countryCode: 'JP',
    companyName: 'FinCorp',
  },
  {
    firstName: 'Chris',
    lastName: 'Garcia',
    email: 'chris.garcia@example.com',
    jobTitle: 'Operations Manager',
    countryCode: 'FR',
    companyName: 'OpWorks',
  },
  {
    firstName: 'Laura',
    lastName: 'Martinez',
    email: 'laura.martinez@example.com',
    jobTitle: 'Content Strategist',
    countryCode: 'ES',
    companyName: 'Content Creators',
  },
  {
    firstName: 'James',
    lastName: 'Rodriguez',
    email: 'james.rodriguez@example.com',
    jobTitle: 'Business Analyst',
    countryCode: 'IT',
    companyName: 'Biz Solutions',
  },
  {
    firstName: 'Anna',
    lastName: 'Martinez',
    email: 'anna.martinez@example.com',
    jobTitle: 'Customer Support',
    countryCode: 'BR',
    companyName: 'SupportHub',
  },
  {
    firstName: 'Brian',
    lastName: 'Lopez',
    email: 'brian.lopez@example.com',
    jobTitle: 'Data Scientist',
    countryCode: 'MX',
    companyName: 'Data Insights',
  },
  {
    firstName: 'Megan',
    lastName: 'Hernandez',
    email: 'megan.hernandez@example.com',
    jobTitle: 'UX Designer',
    countryCode: 'NL',
    companyName: 'DesignPro',
  },
  {
    firstName: 'Justin',
    lastName: 'Gonzales',
    email: 'justin.gonzales@example.com',
    jobTitle: 'IT Specialist',
    countryCode: 'ZA',
    companyName: 'IT Experts',
  },
  {
    firstName: 'Olivia',
    lastName: 'Wilson',
    email: 'olivia.wilson@example.com',
    jobTitle: 'Legal Advisor',
    countryCode: 'NZ',
    companyName: 'Legal Counsel',
  },
  {
    firstName: 'Ethan',
    lastName: 'Clark',
    email: 'ethan.clark@example.com',
    jobTitle: 'Project Manager',
    countryCode: 'SE',
    companyName: 'Project Solutions',
  },
  {
    firstName: 'Sophia',
    lastName: 'Lewis',
    email: 'sophia.lewis@example.com',
    jobTitle: 'Marketing Coordinator',
    countryCode: 'CH',
    companyName: 'Market Leaders',
  },
  {
    firstName: 'Luke',
    lastName: 'Young',
    email: 'luke.young@example.com',
    jobTitle: 'Network Engineer',
    countryCode: 'SG',
    companyName: 'Net Solutions',
  },
  {
    firstName: 'Ava',
    lastName: 'Allen',
    email: 'ava.allen@example.com',
    jobTitle: 'SEO Specialist',
    countryCode: 'NO',
    companyName: 'SEO Experts',
  },
  {
    firstName: 'Henry',
    lastName: 'King',
    email: 'henry.king@example.com',
    jobTitle: 'Graphic Designer',
    countryCode: 'FI',
    companyName: 'Creative Designs',
  },
  {
    firstName: 'Virginia',
    lastName: 'Jennings',
    email: 'frostthomas@hotmail.com',
    jobTitle: null,
    countryCode: 'CM',
    companyName: 'NextGen Solutions',
  },
  {
    firstName: 'Margaret',
    lastName: 'Wilson',
    email: 'yukim@medina-grimes.com',
    jobTitle: 'Analytical chemist',
    countryCode: null,
    companyName: 'NextGen Solutions',
  },
  {
    firstName: 'Susan',
    lastName: 'Holt',
    email: 'jodybutler@yahoo.com',
    jobTitle: 'Engineer, manufacturing systems',
    countryCode: 'IR',
    companyName: null,
  },
  {
    firstName: 'Meghan',
    lastName: 'Glover',
    email: 'douglas30@yahoo.com',
    jobTitle: 'Sound technician, broadcasting/film/video',
    countryCode: 'NI',
    companyName: 'Creative Insights Co.',
  },
  {
    firstName: 'Phyllis',
    lastName: 'Williams',
    email: 'melissa10@yahoo.com',
    jobTitle: 'Clinical cytogeneticist',
    countryCode: 'TO',
    companyName: 'Creative Insights Co.',
  },
]

const prisma = new PrismaClient()

async function main() {
  // Idempotent: email has no unique constraint yet, so skip leads that already exist instead of using upsert
  const existing = await prisma.lead.findMany({
    where: { email: { in: SAMPLE_LEADS.map((lead) => lead.email) } },
    select: { email: true },
  })
  const existingEmails = new Set(existing.map((lead) => lead.email))
  const toCreate = SAMPLE_LEADS.filter((lead) => !existingEmails.has(lead.email))

  const { count } = await prisma.lead.createMany({ data: toCreate })
  console.log(`Seeded ${count} leads (${SAMPLE_LEADS.length - count} already present)`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
