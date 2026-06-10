const MAX_SEEN = 2000;

export class MessageDedup {
  private readonly order: string[] = [];
  private readonly seen = new Set<string>();

  has(messageId: string): boolean {
    return this.seen.has(messageId);
  }

  add(messageId: string): void {
    if (!messageId || this.seen.has(messageId)) return;
    this.seen.add(messageId);
    this.order.push(messageId);
    while (this.order.length > MAX_SEEN) {
      const oldest = this.order.shift();
      if (oldest) this.seen.delete(oldest);
    }
  }
}
