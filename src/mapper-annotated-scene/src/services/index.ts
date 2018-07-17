import Logger from "@/util/log";

const log = Logger(__filename)


/**
 * Load all the services
 */
export function loadServices() {
  log.info("Loading services")
  require("./UIMessageService")
}

/**
 * Load offline data for initial state
 */
function loadInitialState() {
  const AnnotatedSceneActions = require("mapper-annotated-scene/src/store/actions/AnnotatedSceneActions").default
  new AnnotatedSceneActions().loadAppState()
}

export async function loadStore() {
  console.log("Starting to load store")
  const annotatedSceneStore = require("mapper-annotated-scene/src/store/AppStore")
  try {
    annotatedSceneStore.loadAndInitStore()

    // Update state with data persisted offline
    loadInitialState()

    loadServices()
  } catch (err) {
    log.error("Failed to load store", err)
  }
  console.log("Finished loading store")
}
