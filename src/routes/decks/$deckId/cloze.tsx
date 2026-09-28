import { createFileRoute } from '@tanstack/react-router'
import { Replayable } from '../../../components/ui'
import { Cloze } from '../../../games/Cloze'
import { useDeck } from '../../../lib/useDeck'

export const Route = createFileRoute('/decks/$deckId/cloze')({
  component: function ClozePage() {
    const deck = useDeck()
    return <Replayable>{(restart) => <Cloze deck={deck} onRestart={restart} />}</Replayable>
  },
})
