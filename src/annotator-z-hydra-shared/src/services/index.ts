import Logger from "@/util/log";

const log = Logger(__filename)


/**
 * Load all the services
 */
export function loadServices() {
  log.info("Loading services")
  require("./UIMessageService")
  require("./RoadNetworkService")
}

/**
 * Load offline data for initial state
 */
function loadInitialState() {
  const RoadNetworkEditorActions = require("annotator-z-hydra-shared/src/store/actions/RoadNetworkEditorActions").default
  new RoadNetworkEditorActions().loadAppState()
}

export async function loadStore() {
  console.log("Starting to load store")
  const roadEditorStore = require("annotator-z-hydra-shared/src/store/AppStore")
  try {
    roadEditorStore.loadAndInitStore()

    // Update state with data persisted offline
    loadInitialState()

    loadServices()
  } catch (err) {
    log.error("Failed to load store", err)
  }
  console.log("FINISHED LOADING STORE")
}
