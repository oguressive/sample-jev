import { Link, createFileRoute } from "@tanstack/react-router";
import { PROGRAMS } from "@sample-jev/contracts";
import { Panel } from "@sample-jev/ui";

export const Route = createFileRoute("/")({ component: ProgramIndex });

function ProgramIndex() {
  return (
    <Panel label="Open programs">
      <div className="signal-grid">
        {Object.values(PROGRAMS).map((program) => (
          <article className="signal-card" key={program.slug}>
            <span>{program.grant}</span>
            <strong>{program.name}</strong>
            <p className="policy-note">{program.tagline}</p>
            <Link className="sample-chip" to="/programs/$slug" params={{ slug: program.slug }}>詳細と適合判定 →</Link>
          </article>
        ))}
      </div>
      <p className="privacy-note">この一覧と詳細はサーバーレンダリングされます。プログラムは架空の合成データです。</p>
    </Panel>
  );
}
