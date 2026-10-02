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
