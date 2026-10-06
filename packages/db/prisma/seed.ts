/* Idempotent dev seed. Safe to re-run: upserts reference data and only creates
 * sample tickets when the tickets table is empty. */
import bcrypt from 'bcryptjs';
import { PrismaClient, Priority } from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD = 'Password123!';
const minutes = (n: number) => new Date(Date.now() + n * 60_000);

const SLA: Record<Priority, [firstResponse: number, resolution: number]> = {
  URGENT: [15, 4 * 60],
  HIGH: [60, 8 * 60],
  NORMAL: [4 * 60, 24 * 60],
  LOW: [8 * 60, 72 * 60],
};

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const [priority, [fr, res]] of Object.entries(SLA) as [Priority, [number, number]][]) {
    await prisma.slaPolicy.upsert({
      where: { priority },
      update: { firstResponseMinutes: fr, resolutionMinutes: res },
      create: { priority, firstResponseMinutes: fr, resolutionMinutes: res },
    });
  }

  const [l1, l2, devops] = await Promise.all(
    [
      ['L1 Support', 'Front-line triage'],
      ['L2 Engineering', 'Escalations needing engineering'],
      ['DevOps', 'Infrastructure & outages'],
    ].map(([name, description]) =>
      prisma.group.upsert({ where: { name: name! }, update: {}, create: { name: name!, description } }),
    ),
  );

  const acme = await prisma.organization.upsert({
    where: { domain: 'acme.test' },
    update: {},
    create: { name: 'Acme Corp', domain: 'acme.test' },
  });

  const user = (email: string, name: string, role: 'ADMIN' | 'AGENT' | 'CUSTOMER', organizationId?: string) =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, role, passwordHash, organizationId },
    });

  const admin = await user('admin@helpdesk.local', 'Ada Admin', 'ADMIN');
  const alice = await user('alice@helpdesk.local', 'Alice Agent', 'AGENT');
  const bob = await user('bob@helpdesk.local', 'Bob Agent', 'AGENT');
  const carol = await user('carol@acme.test', 'Carol Customer', 'CUSTOMER', acme.id);
  const dave = await user('dave@acme.test', 'Dave Customer', 'CUSTOMER', acme.id);

  const memberships = [
    [admin.id, l2!.id],
    [alice.id, l1!.id],
    [bob.id, l1!.id],
    [bob.id, devops!.id],
  ];
  for (const [userId, groupId] of memberships) {
    await prisma.groupMember.upsert({
      where: { userId_groupId: { userId: userId!, groupId: groupId! } },
      update: {},
      create: { userId: userId!, groupId: groupId! },
    });
  }

  if ((await prisma.ticket.count()) === 0) {
    const samples = [
      {
        subject: 'Cannot log in to the billing portal',
        body: 'Since this morning I get "invalid session" right after entering my password.',
        priority: 'HIGH' as const,
        type: 'INCIDENT' as const,
        requester: carol,
        status: 'NEW' as const,
        tags: ['billing', 'login'],
      },
      {
        subject: 'How do I export last month’s invoices?',
        body: 'Is there a CSV export somewhere? I need it for our accountant.',
        priority: 'LOW' as const,
        type: 'QUESTION' as const,
        requester: dave,
        status: 'OPEN' as const,
        assignee: alice,
        group: l1,
        tags: ['billing'],
      },
      {
        subject: 'API returning 502 for /orders endpoint',
        body: 'Roughly 30% of calls to POST /orders are failing with 502 since 09:40 UTC.',
        priority: 'URGENT' as const,
        type: 'INCIDENT' as const,
        requester: carol,
        status: 'OPEN' as const,
        assignee: bob,
        group: devops,
        tags: ['api', 'outage'],
      },
    ];

    for (const s of samples) {
      const [fr, res] = SLA[s.priority];
      const t = await prisma.ticket.create({
        data: {
          subject: s.subject,
          priority: s.priority,
          type: s.type,
          status: s.status,
          tags: s.tags,
          requesterId: s.requester.id,
          organizationId: acme.id,
          assigneeId: s.assignee?.id,
          groupId: s.group?.id,
          firstResponseDueAt: minutes(fr),
          resolutionDueAt: minutes(res),
          comments: { create: { authorId: s.requester.id, body: s.body, isPublic: true } },
          auditLogs: { create: { actorId: s.requester.id, action: 'ticket.created' } },
        },
      });
      if (s.assignee) {
        await prisma.comment.create({
          data: {
            ticketId: t.id,
            authorId: s.assignee.id,
            isPublic: false,
            body: 'Internal: looking into this now — customers cannot see this note.',
          },
        });
      }
    }
  }

  console.log(`Seed complete. All users have password: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
