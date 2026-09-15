export type GiftOrder = {
  item: string;
  note: string;
  name: string;
  company: string;
  address: string;
};

export type GiftResult = {
  providerId: string;
  dryRun: boolean;
  charged: boolean;
  vendor: string;
};

export type GiftPort = {
  send(order: GiftOrder): Promise<GiftResult>;
};

export class MockGift implements GiftPort {
  readonly orders: GiftOrder[] = [];

  async send(order: GiftOrder): Promise<GiftResult> {
    this.orders.push(order);
    return {
      providerId: `mock_gift_${this.orders.length}`,
      dryRun: true,
      charged: false,
      vendor: "mock",
    };
  }
}

/** Postal/Sendoso-shaped adapter. Never charges without GIFT_API_URL. Sandbox always dry-runs. */
export class KeyedGift implements GiftPort {
  constructor(
    private readonly vendor: "postal" | "sendoso",
    private readonly apiKey: string,
    private readonly apiUrl: string | undefined,
    private readonly sandbox: boolean,
  ) {}

  async send(order: GiftOrder): Promise<GiftResult> {
    if (this.sandbox || !this.apiUrl) {
      return {
        providerId: `${this.vendor}_dry_${this.apiKey.slice(0, 4)}`,
        dryRun: true,
        charged: false,
        vendor: this.vendor,
      };
    }
    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        item: order.item,
        note: order.note,
        recipient: { name: order.name, company: order.company, address: order.address },
      }),
    });
    if (!res.ok) {
      throw new Error(`${this.vendor} gift order failed`);
    }
    const body = (await res.json()) as { id?: string };
    return {
      providerId: body.id ?? `${this.vendor}_${Date.now()}`,
      dryRun: false,
      charged: true,
      vendor: this.vendor,
    };
  }
}

export function createGiftPort(
  env: { [key: string]: string | undefined } = process.env,
  opts?: { sandbox?: boolean },
): GiftPort {
  const sandbox = opts?.sandbox ?? true;
  const url = env.GIFT_API_URL?.trim();
  const postal = env.POSTAL_API_KEY?.trim();
  const sendoso = env.SENDOSO_API_KEY?.trim();
  if (postal) return new KeyedGift("postal", postal, url, sandbox);
  if (sendoso) return new KeyedGift("sendoso", sendoso, url, sandbox);
  return new MockGift();
}
