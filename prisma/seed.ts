import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./prisma/dev.db' })
const prisma = new PrismaClient({ adapter } as any)

const DEMO_PASSWORD = 'password123'

async function main() {
  console.log('Seeding demo data...')
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  await prisma.notification.deleteMany()
  await prisma.deal.deleteMany()
  await prisma.offer.deleteMany()
  await prisma.propertyPhoto.deleteMany()
  await prisma.property.deleteMany()
  await prisma.sellerKyc.deleteMany()
  await prisma.user.deleteMany()

  const [seller, buyer, agent, backend, admin] = await Promise.all([
    prisma.user.create({ data: { name: 'Ananya Rao', email: 'seller@demo.test', phone: '9880011223', passwordHash, role: 'SELLER' } }),
    prisma.user.create({ data: { name: 'Rohit Sharma', email: 'buyer@demo.test', phone: '9880011224', passwordHash, role: 'BUYER' } }),
    prisma.user.create({ data: { name: 'Megan Fernandes', email: 'agent@demo.test', phone: '9880011225', passwordHash, role: 'AGENT' } }),
    prisma.user.create({ data: { name: 'Karan Bedi', email: 'backend@demo.test', phone: '9880011226', passwordHash, role: 'BACKEND' } }),
    prisma.user.create({ data: { name: 'Priya Nair', email: 'admin@demo.test', phone: '9880011227', passwordHash, role: 'ADMIN' } }),
  ])

  // A few extra buyers/sellers so admin/backend/agent lists aren't single-user
  const extraUsers = await Promise.all([
    prisma.user.create({ data: { name: 'Vikram Singh', email: 'seller2@demo.test', passwordHash, role: 'SELLER' } }),
    prisma.user.create({ data: { name: 'Divya Menon', email: 'buyer2@demo.test', passwordHash, role: 'BUYER' } }),
    prisma.user.create({ data: { name: 'Arjun Kapoor', email: 'buyer3@demo.test', passwordHash, role: 'BUYER' } }),
  ])
  const [seller2, buyer2, buyer3] = extraUsers

  await prisma.sellerKyc.create({
    data: { userId: seller.id, idType: 'AADHAAR', status: 'APPROVED' },
  })
  await prisma.sellerKyc.create({
    data: { userId: seller2.id, idType: 'PAN', status: 'PENDING' },
  })

  const propertyData = [
    { seller, title: 'Indiranagar 3BHK Apartment', location: 'Indiranagar, Bangalore', type: 'RESIDENTIAL', areaSqft: 1850, bhk: 3, askingPrice: 18500000, status: 'LIVE', plan: 'VERIFIED', verifiedAt: new Date(), agent },
    { seller, title: 'Koramangala 2BHK Flat', location: 'Koramangala, Bangalore', type: 'RESIDENTIAL', areaSqft: 1200, bhk: 2, askingPrice: 13500000, status: 'LIVE', plan: 'ELITE', verifiedAt: new Date(), agent },
    { seller, title: 'Whitefield 4BHK Villa', location: 'Whitefield, Bangalore', type: 'RESIDENTIAL', areaSqft: 4500, bhk: 4, askingPrice: 55000000, status: 'PENDING_VERIFICATION', plan: 'BASIC', agent: null },
    { seller, title: 'HSR Layout DTCP Plot', location: 'HSR Layout, Bangalore', type: 'PLOT', areaSqft: 2400, bhk: null, askingPrice: 9500000, status: 'DRAFT', plan: 'BASIC', agent: null },
    { seller: seller2, title: 'Jayanagar 3BHK Apartment', location: 'Jayanagar, Bangalore', type: 'RESIDENTIAL', areaSqft: 1650, bhk: 3, askingPrice: 17500000, status: 'CLOSED', plan: 'VERIFIED', verifiedAt: new Date(), agent },
    { seller: seller2, title: 'HSR Layout Independent House', location: 'HSR Layout, Bangalore', type: 'RESIDENTIAL', areaSqft: 2800, bhk: 4, askingPrice: 30000000, status: 'CLOSED', plan: 'VERIFIED', verifiedAt: new Date(), agent },
  ]

  const properties = []
  for (const p of propertyData) {
    const created = await prisma.property.create({
      data: {
        sellerId: p.seller.id,
        agentId: p.agent ? p.agent.id : null,
        type: p.type,
        title: p.title,
        description: `${p.bhk ? p.bhk + 'BHK ' : ''}${p.type === 'PLOT' ? 'plot' : 'home'} in ${p.location}.`,
        location: p.location,
        areaSqft: p.areaSqft,
        bhk: p.bhk ?? null,
        askingPrice: p.askingPrice,
        status: p.status,
        plan: p.plan,
        verifiedAt: p.verifiedAt ?? null,
      },
    })
    properties.push(created)
  }

  const [indiranagar, koramangala, whitefield, hsrPlot, jayanagar, hsrHouse] = properties

  await prisma.offer.createMany({
    data: [
      // Already forwarded by backend, awaiting seller action
      { propertyId: indiranagar.id, buyerId: buyer.id, amount: 17800000, message: 'Ready to move fast, ready funds.', status: 'PENDING', reviewedBy: backend.id },
      // Countered — one by the seller, one directly by backend (buyer can't tell the difference)
      { propertyId: koramangala.id, buyerId: buyer.id, amount: 13000000, message: 'Can we discuss the price?', status: 'COUNTERED', counterAmount: 13250000, counterBy: 'SELLER', reviewedBy: backend.id },
      { propertyId: indiranagar.id, buyerId: buyer3.id, amount: 16500000, status: 'COUNTERED', counterAmount: 17200000, counterBy: 'BACKEND', reviewedBy: backend.id },
      // Freshly submitted, still sitting in backend's negotiation queue
      { propertyId: indiranagar.id, buyerId: buyer2.id, amount: 18000000, status: 'PENDING_REVIEW' },
      { propertyId: koramangala.id, buyerId: buyer3.id, amount: 13500000, status: 'ACCEPTED', reviewedBy: backend.id },
    ],
  })

  await prisma.deal.create({
    data: {
      propertyId: jayanagar.id,
      buyerId: buyer.id,
      sellerId: seller2.id,
      agentId: agent.id,
      agreedPrice: 17500000,
      status: 'CLOSED',
    },
  })
  await prisma.deal.create({
    data: {
      propertyId: hsrHouse.id,
      buyerId: buyer2.id,
      sellerId: seller2.id,
      agentId: agent.id,
      agreedPrice: 29500000,
      status: 'CLOSED',
    },
  })
  await prisma.deal.create({
    data: {
      propertyId: koramangala.id,
      buyerId: buyer3.id,
      sellerId: seller.id,
      agentId: agent.id,
      agreedPrice: 13300000,
      status: 'IN_PROGRESS',
    },
  })

  const notifTargets = [seller, buyer, agent, backend, admin]
  const notifSamples: Array<[string, string, string]> = [
    ['Offer received', 'Rohit Sharma made an offer of ₹1.78 Cr on Indiranagar 3BHK Apartment', seller.id],
    ['KYC approved', 'Your seller KYC has been verified. You can now publish listings.', seller.id],
    ['Offer countered', 'Seller countered your offer on Koramangala 2BHK Flat with ₹1.325 Cr', buyer.id],
    ['Deal closed', 'Your deal on Jayanagar 3BHK Apartment has been marked closed', buyer.id],
    ['New assignment', 'You have been assigned as agent for Indiranagar 3BHK Apartment', agent.id],
    ['Deal update', 'HSR Layout Independent House deal closed at ₹2.95 Cr', agent.id],
    ['KYC submitted', 'Vikram Singh submitted KYC documents for review', backend.id],
    ['Listing submitted', 'Whitefield 4BHK Villa is pending verification', backend.id],
    ['New user', 'A new agent account was created: Megan Fernandes', admin.id],
    ['Platform activity', '3 new offers were placed today', admin.id],
  ]
  for (const [title, message, userId] of notifSamples) {
    await prisma.notification.create({ data: { title, message, userId } })
  }

  console.log('Seed complete. Demo accounts (password: %s):', DEMO_PASSWORD)
  for (const u of [seller, buyer, agent, backend, admin]) {
    console.log(`  ${u.role.padEnd(8)} ${u.email}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
