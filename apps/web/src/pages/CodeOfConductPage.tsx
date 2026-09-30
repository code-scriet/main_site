import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import './CodeOfConduct.css';

export default function CodeOfConductPage() {
  return (
    <Layout>
      <SEO
        title="Code of Conduct — code.scriet"
        description="The code of conduct of code.scriet, the student-run coding society of SCRIET, CCSU Meerut."
        url="/code-of-conduct"
      />

      <div className="coc-page">
        <header className="coc-hero">
          <img
            src="/logo.jpg"
            alt="code.scriet logo: Community of Developers and Engineers, SCRIET"
          />
          <div>
            <h1>Code of Conduct</h1>
            <p>
              The rules we write for ourselves. code.scriet is the student-run coding society
              of SCRIET, CCSU Meerut. This code explains how we lead, how we treat each other,
              and how we keep the society in student hands.
            </p>
          </div>
        </header>

        <div className="coc-wrap">
          <nav className="coc-nav" aria-label="Sections">
            <a href="#p1">Autonomy</a>
            <a href="#p2">Structure</a>
            <a href="#p3">Respect</a>
            <a href="#p4">Commitment</a>
            <a href="#p5">Discipline</a>
            <a href="#p6">Leadership</a>
            <a href="#p7">Integrity</a>
            <a href="#p8">Recognition</a>
            <a href="#p9">Amendments</a>
          </nav>

          <main className="coc-main">
            <section id="p1" className="coc-section">
              <h2>Student autonomy</h2>
              <article className="coc-article">
                <h3>A society run by students</h3>
                <ol>
                  <li>
                    code.scriet is a student autonomous club. Students hold every post, run every
                    meeting, and make every decision.
                  </li>
                  <li>
                    Faculty, professors, and staff are welcome to share their point of view and we
                    value it. Their view is advice, not authority.
                  </li>
                  <li>
                    No teacher, professor, or staff member may appoint, remove, or overrule an
                    office-bearer, or change the structure of the society.
                  </li>
                  <li>
                    If the institute requires a faculty coordinator for permissions, venues, or
                    funds, the coordinator supports the society in those matters only.
                  </li>
                </ol>
              </article>
            </section>

            <section id="p2" className="coc-section">
              <h2>Structure and hierarchy</h2>
              <article className="coc-article">
                <h3>Chain of command</h3>
                <ol className="coc-chain" aria-label="Chain of command, highest to lowest">
                  <li>
                    <b>President</b> &nbsp;leads the society and represents it
                  </li>
                  <li>
                    <b>Vice President</b> &nbsp;supports the President and runs operations
                  </li>
                  <li>
                    <b>Convener</b> &nbsp;coordinates teams, meetings, and events
                  </li>
                  <li>
                    <b>Team Lead</b> &nbsp;leads a track: Technical, DSA, Design, Social Media, or
                    Management
                  </li>
                  <li>
                    <b>Member</b> &nbsp;learns, builds, and contributes
                  </li>
                </ol>
                <ol>
                  <li>
                    Every member listens to and follows the next level above them in matters of work,
                    deadlines, and events. Work is passed up the chain, and instructions come down
                    it.
                  </li>
                  <li>
                    Authority covers the work only. It never covers a person&apos;s dignity, time
                    outside the club, or personal life.
                  </li>
                  <li>
                    No one has to follow an instruction that is unethical, unsafe, humiliating, or
                    against this code. Report it under Article 6.
                  </li>
                  <li>
                    The President, VP, Convener, and Team Leads together form the Executive Committee,
                    which takes the society&apos;s decisions.
                  </li>
                </ol>
              </article>
              <article className="coc-article">
                <h3>Duties of office-bearers</h3>
                <ol>
                  <li>
                    Team Leads plan their track&apos;s activities, guide their members, and report
                    progress to the Convener.
                  </li>
                  <li>
                    The Convener keeps teams aligned, keeps minutes of every meeting, and tracks
                    attendance.
                  </li>
                  <li>Higher posts carry more responsibility, not more privilege.</li>
                </ol>
              </article>
            </section>

            <section id="p3" className="coc-section">
              <h2>Respect and safety</h2>
              <article className="coc-article">
                <h3>Zero tolerance for humiliation</h3>
                <ol>
                  <li>
                    No person may insult, mock, shout at, threaten, shame, or publicly embarrass
                    another. This applies equally to the President, the VP, and every other member,
                    and to the faculty who visit us.
                  </li>
                  <li>
                    Ragging, discrimination, and harassment are prohibited. This includes bias based
                    on gender, caste, religion, region, language, branch, year, appearance, or skill
                    level.
                  </li>
                  <li>
                    Feedback on work is encouraged. It must be specific, about the work and not the
                    person, and given privately unless it is praise.
                  </li>
                  <li>
                    The same rules apply in WhatsApp, Discord, GitHub, social media, and every other
                    online space of the society.
                  </li>
                </ol>
              </article>
              <article className="coc-article">
                <h3>A welcoming place to learn</h3>
                <ol>
                  <li>No question is stupid. Seniors mentor and do not gatekeep.</li>
                  <li>
                    Opportunities, projects, and roles go by merit and willingness to work, never by
                    friendship or seniority alone.
                  </li>
                  <li>
                    Members from every branch and year belong here, from first-years writing their
                    first program to final-years preparing for placements.
                  </li>
                </ol>
              </article>
              <article className="coc-article">
                <h3>Raising a concern</h3>
                <ol>
                  <li>
                    Anyone can raise a concern about conduct with their Team Lead, the Convener, the
                    VP, or the President.
                  </li>
                  <li>
                    If the concern is about someone in that chain, go to the next level above them.
                    If it is about the President, go to the Alumni Council.
                  </li>
                  <li>
                    Concerns are kept confidential, and no one may retaliate against a person who
                    raises one in good faith.
                  </li>
                  <li>Deliberately false complaints are a breach of this code.</li>
                </ol>
              </article>
            </section>

            <section id="p4" className="coc-section">
              <h2>Commitment and attendance</h2>
              <article className="coc-article">
                <h3>Attendance</h3>
                <ol>
                  <li>
                    Attending every offline meet is expected of every member and office-bearer.
                  </li>
                  <li>
                    Missing three consecutive offline meets without a valid reason puts the person&apos;s
                    post under formal review. It does not mean automatic removal.
                  </li>
                  <li>
                    Illness, exams, family emergencies, and official college duties are valid
                    reasons. Tell your Team Lead before the meet, or within 48 hours if it was an
                    emergency.
                  </li>
                  <li>
                    The Convener records attendance and shares it with the Executive Committee each
                    month.
                  </li>
                </ol>
              </article>
              <article className="coc-article">
                <h3>Exclusive leadership</h3>
                <ol>
                  <li>
                    The President and the VP may not hold an executive or leadership post in any other
                    club or society during their term.
                  </li>
                  <li>Ordinary membership in other clubs is fine for everyone.</li>
                  <li>
                    Any office-bearer with a personal interest in a decision, such as a friend or
                    relative involved, must say so and step out of that decision.
                  </li>
                </ol>
              </article>
            </section>

            <section id="p5" className="coc-section">
              <h2>Discipline</h2>
              <article className="coc-article">
                <h3>A fair process</h3>
                <ol>
                  <li>
                    No one loses a post or membership without a warning and a chance to explain.
                  </li>
                  <li>
                    The steps are a verbal warning, a written warning, a hearing before the Executive
                    Committee, and then a decision.
                  </li>
                  <li>
                    A decision to remove a member or Team Lead needs a two-thirds vote of the
                    Executive Committee. People involved in the matter do not vote.
                  </li>
                  <li>
                    Removing the Convener, VP, or President needs a two-thirds vote of the Executive
                    Committee and the consent of the Alumni Council.
                  </li>
                  <li>
                    Serious breaches, such as harassment, ragging, or misuse of funds, may skip the
                    warning steps and go straight to a hearing.
                  </li>
                  <li>
                    Anyone removed may appeal once to the Alumni Council within 7 days. Its decision
                    is final.
                  </li>
                </ol>
              </article>
            </section>

            <section id="p6" className="coc-section">
              <h2>Leadership and succession</h2>
              <article className="coc-article">
                <h3>Annual selection</h3>
                <ol>
                  <li>
                    Every year, all posts are filled through open applications and proper interviews,
                    with tracks matching our Join Us process.
                  </li>
                  <li>
                    Every eligible member may apply. Selection is based on skill, contribution,
                    attitude, and reliability.
                  </li>
                  <li>
                    The panel has the outgoing President or VP, the Convener, a Team Lead who is not
                    applying, and one member of the Alumni Council. Panelists with a personal tie to a
                    candidate step aside.
                  </li>
                  <li>
                    A post term is one year. A person may hold the same top post for at most two
                    terms.
                  </li>
                </ol>
              </article>
              <article className="coc-article">
                <h3>Alumni Council</h3>
                <ol>
                  <li>
                    Former Presidents and founding members form the Alumni Council of three to five
                    people, who take part in appointing each new President.
                  </li>
                  <li>
                    The Council advises, helps settle serious disputes, and hears appeals. It does
                    not run day-to-day work.
                  </li>
                  <li>
                    Members of the Council may serve for up to two years after leaving their post, so
                    that no single batch controls the society for good.
                  </li>
                </ol>
              </article>
              <article className="coc-article">
                <h3>Succession</h3>
                <ol>
                  <li>
                    If the President resigns or cannot continue, the Vice President becomes President.
                  </li>
                  <li>The Convener then becomes Vice President.</li>
                  <li>
                    The vacant Convener post is filled by selection or election from the Executive
                    Committee.
                  </li>
                  <li>
                    Outgoing office-bearers hand over accounts, repositories, credentials, and
                    records to their successors within 14 days.
                  </li>
                </ol>
              </article>
              <article className="coc-article">
                <h3>No confidence</h3>
                <ol>
                  <li>
                    One-third of all members can sign a motion of no confidence against any
                    office-bearer.
                  </li>
                  <li>
                    The motion passes with two-thirds of members present at a meeting with a quorum
                    of half the members, and it is confirmed by the Alumni Council.
                  </li>
                </ol>
              </article>
            </section>

            <section id="p7" className="coc-section">
              <h2>Integrity and ethics</h2>
              <article className="coc-article">
                <h3>Honest code, honest money</h3>
                <ol>
                  <li>
                    Plagiarism is not allowed. Credit your sources, follow open-source licences, and
                    name every teammate in group work.
                  </li>
                  <li>
                    No hacking, scraping, or security testing of any system without written
                    permission. Do not misuse college networks, servers, or other people&apos;s data.
                  </li>
                  <li>
                    Meeting minutes, decisions, and event budgets are recorded and open to every
                    member. Every rupee the society handles is documented.
                  </li>
                  <li>
                    Members&apos; personal data, such as phone numbers and IDs, is used only for
                    society work and kept safe.
                  </li>
                  <li>The name and logo of code.scriet may be used for society activity only.</li>
                </ol>
              </article>
            </section>

            <section id="p8" className="coc-section">
              <h2>Recognition</h2>
              <article className="coc-article">
                <h3>Credit where it is due</h3>
                <ol>
                  <li>
                    Every year, each member who contributed to code.scriet receives a Certificate of
                    Appreciation.
                  </li>
                  <li>
                    Outstanding work, such as best project, best mentor, and most consistent member,
                    gets special recognition.
                  </li>
                  <li>
                    Contributors are credited on our{' '}
                    <Link to="/credits" className="underline font-medium">
                      public credits page
                    </Link>
                    .
                  </li>
                </ol>
              </article>
            </section>

            <section id="p9" className="coc-section">
              <h2>Amendments</h2>
              <article className="coc-article">
                <h3>Changing this code</h3>
                <ol>
                  <li>Any member may propose an amendment to the Executive Committee.</li>
                  <li>
                    An amendment needs a two-thirds vote of the Executive Committee, ratification by
                    a general body meeting, and consultation with the Alumni Council.
                  </li>
                  <li>
                    No amendment may give faculty or staff control over the society, and Article 1
                    is protected in that sense.
                  </li>
                  <li>By joining code.scriet, every member agrees to follow this code.</li>
                </ol>
              </article>
              <p className="coc-note">
                Questions or concerns? Write to us through the{' '}
                <Link to="/contact">contact page</Link>. Version 1.0, adopted 2026.
              </p>
            </section>

            <div className="coc-founder-banner">
              <p className="coc-founder-title">
                Code of Conduct by{' '}
                <a
                  href="https://github.com/princeguptaa13"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold hover:text-white"
                >
                  Prince Gupta
                </a>
                , Founder, code.scriet
              </p>
              <div>
                code.scriet · Community of Developers &amp; Engineers ·{' '}
                <Link to="/">codescriet.dev</Link>
              </div>
            </div>
          </main>
        </div>
      </div>
    </Layout>
  );
}
