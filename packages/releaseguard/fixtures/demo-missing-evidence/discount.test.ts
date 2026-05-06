import { describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/discount/apply/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/discount/apply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/discount/apply", () => {
  it("returns 200 for a valid discount", async () => {
    const response = await POST(jsonRequest({ code: "SAVE10" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      code: "SAVE10",
      discountCents: 1000,
    });
  });
});
