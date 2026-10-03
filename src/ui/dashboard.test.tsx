import { render, screen } from '@testing-library/react';
import { Comparison } from './Comparison';
import { PaceCapsule } from './PaceCapsule';
import { StandsOut } from './StandsOut';

describe('Comparison', () => {
  it('shows the signed difference and what it compares with', () => {
    const { container } = render(<Comparison delta={-45483} currency="USD" against="vs a typical Sep 1–24" />);
    // The amount is printed, and spoken in full for screen readers.
    expect(container).toHaveTextContent('−$454.83');
    expect(container).toHaveTextContent('minus $454.83 vs a typical Sep 1–24');
  });
});

describe('PaceCapsule', () => {
  it('fills to the share spent and puts the pace tick where today should be', () => {
    const { container } = render(<PaceCapsule spent={38043} planned={55000} pace={44000} />);
    const bar = container.querySelector('.prog i') as HTMLElement;
    expect(bar.style.width).toBe(`${(38043 / 55000) * 100}%`);
    expect((container.querySelector('.pace-tick') as HTMLElement).style.left).toBe('80%');
    expect(container.querySelector('.prog.over')).toBeNull();
  });

  it('hatches past the plan instead of overflowing', () => {
    const { container } = render(<PaceCapsule spent={8247} planned={8000} pace={6400} />);
    expect(container.querySelector('.prog.over')).not.toBeNull();
    expect((container.querySelector('.prog i') as HTMLElement).style.width).toBe('100%');
  });

  it('has no tick without a pace, as for a goal', () => {
    const { container } = render(<PaceCapsule spent={260000} planned={400000} tone="save" />);
    expect(container.querySelector('.pace-tick')).toBeNull();
    expect(container.querySelector('.prog.spend')).toBeNull();
  });
});

describe('StandsOut', () => {
  it('reads its sentences with the amounts in full', () => {
    render(
      <StandsOut
        currency="USD"
        findings={[{ key: 'out', weight: 1, parts: ['Money out is ', { minor: 45483 }, ' below a typical Sep 1–24.'] }]}
      />,
    );
    expect(screen.getByText(/What stands out/)).toBeInTheDocument();
    expect(screen.getByText(/below a typical Sep 1–24/)).toBeInTheDocument();
    expect(screen.getAllByText('$454.83').length).toBeGreaterThan(0);
  });

  it('says nothing when nothing stands out', () => {
    const { container } = render(<StandsOut currency="USD" findings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RangeBar', () => {
  it('places the figure in its range, and grows the range to reach a figure outside it', async () => {
    const { RangeBar } = await import('./RangeBar');
    const { container, rerender } = render(<RangeBar value={29977} low={26630} high={41339} typical={35152} currency="USD" />);
    expect(container).toHaveTextContent(/\$266\.30.*low.*typical.*\$351\.52.*\$413\.39.*high/);
    const now = container.querySelector('.range-now') as HTMLElement;
    expect(Number(now.style.left.replace('%', ''))).toBeCloseTo(((29977 - 26630) / (41339 - 26630)) * 100, 5);
    rerender(<RangeBar value={50000} low={26630} high={41339} typical={35152} currency="USD" />);
    expect((container.querySelector('.range-now') as HTMLElement).style.left).toBe('100%');
  });
});

describe('SplitBars', () => {
  it('draws the rows to one scale and reads each as a sentence', async () => {
    const { SplitBars } = await import('./SplitBar');
    const { container } = render(
      <SplitBars
        label="Where the money in went"
        currency="USD"
        rows={[
          { label: 'Where it went', parts: [{ label: 'Spent', minor: 300000, tone: 'out' }, { label: 'Into goals', minor: 100000, tone: 'in' }] },
          { label: 'What came in', parts: [{ label: 'Money in', minor: 350000, tone: 'base' }, { label: 'From balances', minor: 50000, tone: 'short' }] },
        ]}
      />,
    );
    const parts = Array.from(container.querySelectorAll('.split-part')) as HTMLElement[];
    expect(parts.map((p) => p.style.width)).toEqual(['75%', '25%', '87.5%', '12.5%']);
    expect(screen.getByRole('group', { name: 'Where the money in went' })).toHaveTextContent(/What came in:.*From balances.*\$500\.00/);
    // Too narrow to hold its words, a part names itself under the bar.
    expect(container.querySelector('.split-legend')).toHaveTextContent('From balances');
  });
});
