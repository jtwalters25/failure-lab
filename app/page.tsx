import { Simulator } from "@/components/Simulator";
import { Findings } from "@/components/Findings";
import { profile } from "@/content/profile";

export default function Page() {
  return (
    <main>
      <header>
        <h1>Why do outages get worse after they&apos;re fixed?</h1>
        <p className="lede">A service goes down for 10 seconds. Pick how its clients retry, and watch what happens after it comes back.</p>
      </header>

      <Simulator />

      <Findings />

      <footer>
        <div className="me">
          <div className="avatar" aria-hidden="true">{profile.initials}</div>
          <div>
            <div className="name">{profile.name}</div>
            <div className="fine">{profile.oneLiner}</div>
          </div>
        </div>
        <div className="links">
          <a className="button" href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
          <a className="button" href={profile.source} target="_blank" rel="noreferrer">Source code</a>
        </div>
      </footer>
    </main>
  );
}
