// Shared test fixtures: a Prisma mock and helpers to fake upstream fetch responses.

export const prismaMock = {
  contactMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  chatLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
};

export const resetPrismaMock = () => {
  for (const model of Object.values(prismaMock)) {
    for (const fn of Object.values(model)) (fn as jest.Mock).mockReset();
  }
  prismaMock.chatLog.create.mockResolvedValue({});
};

export const INTERNAL_KEY = { 'X-Internal-Service-Key': 'test-internal-key-0123456789abcdef' };
export const ADMIN_AUTH = { Authorization: 'Bearer test-admin-token' };

/** A fetch Response whose body streams `chunks` (SSE text) one by one. */
export const sseResponse = (chunks: string[], status = 200) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
};

export const frame = (data: object) => `data: ${JSON.stringify(data)}\n\n`;

export const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
