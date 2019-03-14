import * as AsyncFile from 'async-file'
import * as Electron from 'electron'
import * as THREE from 'three'
import {
  LayerStatus,
  AnnotatedSceneController
} from '@mapperai/mapper-annotated-scene'
import getLogger from 'util/Logger'

const log = getLogger(__filename)
const dialog = Electron.remote.dialog

// TODO JOE make this a class mixin, it is cleaner.

/**
 * Load annotations from file. Add all annotations to the annotation manager
 * and to the scene.
 * Center the stage and the camera on the annotations model.
 */
export default function loadAnnotations(
  fileName: string,
  sceneController: AnnotatedSceneController
): Promise<void> {
  log.info('Loading annotations from ' + fileName)

  return loadAnnotationsFromFile
    .call(this, fileName, sceneController)
    .then(focalPoint => {
      if (focalPoint)
        sceneController.setStage(focalPoint.x, focalPoint.y, focalPoint.z)
      sceneController.setLayerStatus('anot1', LayerStatus.Visible)
    })
    .catch(err => {
      log.error(err.message)
      dialog.showErrorBox('Annotation Load Error', err.message)
    })
}

/**
 * @returns NULL or the center point of the bottom of the bounding box of the data; hopefully
 *   there will be something to look at there
 */
function loadAnnotationsFromFile(
  fileName: string,
  sceneController: AnnotatedSceneController
): Promise<THREE.Vector3 | null> {
  return AsyncFile.readFile(fileName, 'ascii').then((text: string) => {
    const annotations = sceneController.objectToAnnotations(JSON.parse(text))

    if (!annotations)
      throw Error(`annotation file ${fileName} has no annotations`)

    return sceneController.addAnnotations(annotations)
  })
}
