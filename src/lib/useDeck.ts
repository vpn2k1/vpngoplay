import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { deckQuery } from './api'

const deckRoute = getRouteApi('/decks/$deckId')

/** The deck loaded by the /decks/$deckId layout route. */
export function useDeck() {
  const { deckId } = deckRoute.useParams()
  return useSuspenseQuery(deckQuery(deckId)).data
}
