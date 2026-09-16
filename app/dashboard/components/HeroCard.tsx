import { Amount } from '@/app/dashboard/components/Amount';
import { ChevronLeft, Kebab } from '@/app/dashboard/components/icons';

export function HeroCard({
  greeting,
  monthName,
  forecast,
  variableRemaining,
}: {
  greeting: string;
  monthName: string;
  forecast: number;
  /** What is left to spend from the variable envelope this month. */
  variableRemaining: number;
}) {
  const negative = forecast < 0;

  return (
    <article className="card">
      <div className="card-body">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <p className="hero-greeting">היי {greeting}</p>
          <Kebab label="אפשרויות" />
        </div>

        <h1 className="hero-question">איך צפוי להסתיים התזרים של {monthName}?</h1>

        <Amount
          value={forecast}
          decimals={0}
          className={negative ? 'hero-figure is-negative' : 'hero-figure'}
        />

        <a className="pill-link" href="/accounts">
          <span>ומה מצב העו״ש?</span>
          <ChevronLeft size={16} />
        </a>
      </div>

      <div className="hero-foot">
        <p className="headline">
          נשארו <Amount value={variableRemaining} decimals={0} currency={false} /> הוצאות משתנות
        </p>
        <p className="sub">להוציא עד סוף {monthName}</p>
      </div>
    </article>
  );
}
