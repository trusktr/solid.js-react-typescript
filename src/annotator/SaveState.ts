// import * as mkdirp from 'mkdirp'
// import * as AsyncFile from 'async-file'
import {
	AnnotationManager,
	getLogger as Logger,
	IAnnotatedSceneConfig,
} from '@mapperai/mapper-annotated-scene'
import { dateToString } from '../util/dateToString'

const log = Logger(__filename)

enum OutputFormat {
	UTM = 1,
	LLA = 2,
}

/**
 * This tracks transient metadata for the data model, for the duration of a user session.
 */
export default class AnnotationState {
	private isDirty: boolean
	private autoSaveEnabled: boolean
	private autoSaveDirectory: string

	constructor(
		private annotationManager: AnnotationManager,
		private config: IAnnotatedSceneConfig,
	) {
		// eslint-disable-line typescript/no-explicit-any
		this.isDirty = false
		this.autoSaveEnabled = false

		this.autoSaveDirectory = this.config[
			'output.annotations.autosave.directory.path'
		]

		const autoSaveEventInterval =
			this.config['output.annotations.autosave.interval.seconds'] * 1000

		if (this.autoSaveDirectory && autoSaveEventInterval) {
			setInterval(async () => {
				if (this.doPeriodicSave()) await this.saveAnnotations()
			}, autoSaveEventInterval)
		}
	}

	// Mark dirty if the in-memory model has information which is not recorded on disk.
	dirty(): void {
		this.isDirty = true
	}

	// Mark clean if the in-memory model is current with a saved file. Auto-saves don't count.
	clean(): void {
		this.isDirty = false
	}

	enableAutoSave(): void {
		this.autoSaveEnabled = true
	}

	disableAutoSave(): void {
		this.autoSaveEnabled = false
	}

	private doPeriodicSave(): boolean {
		return (
			this.autoSaveEnabled &&
			this.isDirty &&
			!!this.annotationManager.allAnnotations()
		)
	}

	private doImmediateSave(): boolean {
		return this.isDirty && !!this.annotationManager.allAnnotations()
	}

	immediateAutoSave(): Promise<void> {
		if (this.doImmediateSave()) return this.saveAnnotations()
		else return Promise.resolve()
	}

	private saveAnnotations(): Promise<void> {
		const savePath =
			this.autoSaveDirectory + '/' + dateToString(new Date()) + '.json'

		log.info('auto-saving annotations to: ' + savePath)
		return this.saveAnnotationsToFile(savePath, OutputFormat.UTM).catch(error =>
			log.warn('save annotations failed: ' + error.message),
		)
	}

	saveAnnotationsToFile(
		_fileName: string,
		_format: OutputFormat,
	): Promise<void> {
		return Promise.resolve()
		// const annotations = this.annotationManager
		// 	.allAnnotations()
		// 	.filter(a => a.isValid())
		//
		// if (!annotations.length)
		// 	return Promise.reject(Error('failed to save empty set of annotations'))
		//
		// if (
		// 	!this.annotationManager.props.utmCoordinateSystem.hasOrigin &&
		// 	!this.config[
		// 		'output.annotations.debug.allow_annotations_without_utm_origin'
		// 	]
		// ) {
		// 	return Promise.reject(
		// 		Error('failed to save annotations: UTM origin is not set'),
		// 	)
		// }

		//const dirName = fileName.substring(0, fileName.lastIndexOf('/'))

		// return Promise.resolve(mkdirp.sync(dirName))
		// 	.then(() =>
		// 		AsyncFile.writeTextFile(
		// 			fileName,
		// 			JSON.stringify(
		// 				this.annotationManager.toJSON(format, annotations),
		// 				null,
		// 				2,
		// 			),
		// 		),
		// 	)
		// 	.then(() => this.clean())
	}
}
