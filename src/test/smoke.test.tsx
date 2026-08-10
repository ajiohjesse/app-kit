import { render, screen } from "@testing-library/react";

function HarnessSmoke() {
  return <main>App Kit test harness is ready</main>;
}

describe("verification harness", () => {
  it("renders React components in a DOM-like environment", () => {
    render(<HarnessSmoke />);

    expect(screen.getByRole("main")).toHaveTextContent(
      "App Kit test harness is ready"
    );
  });
});
