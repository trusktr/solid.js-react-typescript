/**
 *  Copyright 2018 Mapper Inc.
 *  CONFIDENTIAL. AUTHORIZED USE ONLY. DO NOT REDISTRIBUTE.
 */

import config from '@/config'
import * as React from 'react'
import * as Modal from 'react-modal'
import * as Electron from 'electron'
import VirtualList from 'react-tiny-virtual-list'
import Logger from '@/util/log'
import * as Fs from "fs"
import * as AsyncFile from "async-file"

const executable = require('executable')

const log = Logger(__filename)

const dialog = Electron.remote.dialog

// This magic file is created by RunBatchLidarSLAM.
// https://github.com/Signafy/Perception/tree/develop/apps/Core/RunBatchLidarSLAM
const trajectoryFileName = 'trajectory_lidar.md'

export type TrajectoryFileSelectedCallback = (path: string) => void

export interface TrajectoryDataSet {
	name: string
	path: string
}

interface TrajectoryPickerProps {
}

interface TrajectoryPickerState {
	enabled: boolean
	isOpen: boolean
}

Modal.setAppElement('#root')

export default
class TrajectoryPicker extends React.Component<TrajectoryPickerProps, TrajectoryPickerState> {
	private onTrajectoryFileSelected: TrajectoryFileSelectedCallback | null
	private processedTrajectoriesDir: string
	private unprocessedTrajectoriesDir: string
	private localizerPath: string

	constructor(props: TrajectoryPickerProps) {
		super(props)
		this.onTrajectoryFileSelected = null
		this.processedTrajectoriesDir = config.get('fly_through.trajectory_picker.processed_trajectories_dir')
		this.unprocessedTrajectoriesDir = config.get('fly_through.trajectory_picker.unprocessed_trajectories_dir')
		this.localizerPath = config.get('perception.offline_localizer_path')

		this.state = {
			enabled: false,
			isOpen: false,
		}
	}

	componentDidMount(): void {
		// All for one, one for all
		if (!(this.processedTrajectoriesDir || this.unprocessedTrajectoriesDir || this.localizerPath)) return

		const localizerPromise = executable(this.localizerPath)
			.then(isExecutable => {
				if (!isExecutable) throw Error('Offline localizer is not executable')
			})
			.catch(err => {
				log.error(`Can't load offline localizer: ${err.message}`)
				throw err
			})

		const promises: Promise<void>[] = [localizerPromise]

		const dirs = [this.processedTrajectoriesDir, this.unprocessedTrajectoriesDir]
		dirs.forEach(dir => {
			const promise = AsyncFile.readdir(dir)
				.then(() => {}) // tslint:disable-line:no-empty
				.catch(err => {
					log.error(`Can't open trajectories directory: ${err.message}`)
					throw err
				})
			promises.push(promise)
		})

		Promise.all(promises)
			.then(() => this.setState({enabled: true}))
			.catch(err => dialog.showErrorBox('Offline data-set configuration error', err.message))
	}

	render(): JSX.Element {
		if (!this.state.enabled || !this.state.isOpen)
			return <div/>

		return (
			<Modal
				contentLabel="Choose a trajectory file"
				style={trajectoryPickerStyle}
				isOpen={this.state.isOpen}
				shouldCloseOnOverlayClick={false}
			>
				<h2>Play back a data set</h2>
				{this.unprocessed()}
				{this.processed()}
				<button className="mdc-button mdc-button--raised" onClick={this.closeModal}>
					<span>Cancel</span>
					<i className="material-icons mdc-button__icon" aria-hidden="true">close</i>
				</button>
			</Modal>
		)
	}

	openModal = (cb: TrajectoryFileSelectedCallback): void => {
		if (!this.state.enabled) {
			log.warn('TrajectoryPicker is disabled')
			return
		}

		if (this.onTrajectoryFileSelected)
			log.error('trajectoryFileSelected callback should not be present in openModal()')

		this.onTrajectoryFileSelected = cb
		this.setState({isOpen: true})
	}

	private closeModal = (): void => {
		this.onTrajectoryFileSelected = null
		this.setState({isOpen: false})
	}

	private playTrajectory(path: string): () => void {
		return (): void => {
			if (this.onTrajectoryFileSelected)
				this.onTrajectoryFileSelected(path)
			this.closeModal()
		}
	}

	private loadDirectory(dataSetRoot: string): TrajectoryDataSet[] {
		if (!dataSetRoot) return []

		let names: string[] = []
		try {
			names = Fs.readdirSync(dataSetRoot)
		} catch (err) {
			log.warn(`can't load trajectory files at ${dataSetRoot}`)
			dialog.showErrorBox('Fly-through Load Error', err.message)
		}
		return names
			.map(name => {
				return {
					name: name,
					path: [dataSetRoot, name, trajectoryFileName].join('/'),
				} as TrajectoryDataSet
			})
			.filter(dataSet => Fs.existsSync(dataSet.path))
	}

	private processed(): JSX.Element {
		const dataSets = this.loadDirectory(this.processedTrajectoriesDir)
		if (!dataSets.length)
			return <div><em>No processed data sets are available.</em></div>

		return (
			<div>
				<h3>Processed</h3>
				<p>{dataSets.length} Data Sets</p>
				<VirtualList
					width='100%'
					height={125}
					itemCount={dataSets.length}
					itemSize={50}
					scrollDirection='vertical'
					renderItem={({index, style}): JSX.Element =>
						<div key={index} style={style}>
							<button className="mdc-button mdc-button--raised" onClick={this.playTrajectory(dataSets[index].path)}>
								<span>{dataSets[index].name}</span>
								<i className="material-icons mdc-button__icon" aria-hidden="true">play_arrow</i>
							</button>
						</div>
					}
				/>
			</div>
		)
	}

	private unprocessed(): JSX.Element {
		const dataSets = this.loadDirectory(this.unprocessedTrajectoriesDir)
		if (!dataSets.length)
			return <div/>

		return (
			<div>
				<h3>Unprocessed</h3>
				<p>{dataSets.length} Data Sets</p>
				<div id="processing_container">
					<button className="mdc-button mdc-button--raised" onClick={this.startProcessing}>
						<span>Start Processing</span>
						<i className="material-icons mdc-button__icon" aria-hidden="true">update</i>
					</button>
					<button id="processing_button" className="mdc-button mdc-button--raised">
						<span>Processing…</span>
					</button>
				</div>
				<VirtualList
					width='100%'
					height={100}
					itemCount={dataSets.length}
					itemSize={20}
					scrollDirection='vertical'
					renderItem={({index, style}): JSX.Element =>
						<div key={index} style={style}>
							{dataSets[index].name}
						</div>
					}
				/>
			</div>
		)
	}

	private startProcessing = (): void => {
		// todo
	}
}

// Center it over the main application window.
const trajectoryPickerStyle: Modal.Styles = {
	content: {
		top: '50%',
		left: '50%',
		right: 'auto',
		bottom: 'auto',
		marginRight: '-50%',
		transform: 'translate(-50%, -50%)',
	},
	overlay: {
		position: 'fixed',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.5)'
	},
}
