import * as UUID from 'uuid'
import {StatusKey as AnnotatedSceneStatusKey} from '@mapperai/mapper-annotated-scene/src/models/StatusKey'

const StatusKey = {
	...AnnotatedSceneStatusKey,

	FLY_THROUGH_TRAJECTORY: UUID(),
	FLY_THROUGH_POSE: UUID(),
	LOCATION_SERVER: UUID(),
}

export default StatusKey
