// Utilities (Stream C): the tools drawer — a generic dice roller, the
// age & time helper, and quick notes. Each section is its own component
// (src/components/DiceRoller.tsx, AgeHelper.tsx, QuickNotes.tsx) so they
// can be reused elsewhere; this page only arranges them.
import DiceRoller from '../components/DiceRoller'
import AgeHelper from '../components/AgeHelper'
import QuickNotes from '../components/QuickNotes'

export default function Utilities() {
  return (
    <div>
      <h1 className="mb-2 font-serif text-3xl font-bold">Utilities</h1>
      <p className="mb-5 text-sm text-ink-soft dark:text-parchment/70">
        Small tools for play: dice when a moment needs chance, an age helper for keeping centuries straight, and
        quick notes for thoughts that arrive mid-sentence.
      </p>
      <div className="space-y-5">
        <DiceRoller />
        <AgeHelper />
        <QuickNotes />
      </div>
    </div>
  )
}
