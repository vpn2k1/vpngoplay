import { createFileRoute } from '@tanstack/react-router'
import { Replayable } from '../../../components/ui'
import { Flashcard } from '../../../games/Flashcard'
import { useDeck } from '../../../lib/useDeck'

export const Route = createFileRoute('/decks/$deckId/flashcard')({
  component: function FlashcardPage() {
    const deck = useDeck()
    return <Replayable>{(restart) => <Flashcard deck={deck} onRestart={restart} />}</Replayable>
  },
})
