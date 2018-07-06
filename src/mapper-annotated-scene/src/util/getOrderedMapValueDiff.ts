import {OrderedMap} from 'immutable'

type DiffResult<A, B> = { added: OrderedMap<A, B> | false, removed: OrderedMap<A, B> | false }
type Falsy = '' | 0 | false | null | undefined

export default
function getOrderedMapValueDiff<A, B>( left: OrderedMap<A, B> | Falsy, right: OrderedMap<A, B> | Falsy ): DiffResult<A, B> {
	let added: OrderedMap<A, B> | false = false
	let removed: OrderedMap<A, B> | false = false

	if (!left && right) {
		added = right
	}
	else if (left && !right) {
		removed = left
	}
	else if (left && right) {
		added = right.filter(superTile => !left.includes(superTile!)) as OrderedMap<A, B>
		removed = left.filter(superTile => !right.includes(superTile!)) as OrderedMap<A, B>
	}

	return { added, removed }
}
