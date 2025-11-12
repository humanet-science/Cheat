import {useState, useRef, useCallback} from 'react';

export function useActionQueue() {

	// Action queue: queued actions waiting while frontend animations play
	const [actionQueue, setActionQueue] = useState([]);

	// Add a ref to track if we're currently processing an action (if so, new ones are put on hold).
	const processingRef = useRef(false);

	const addToQueue = useCallback((message) => {
		setActionQueue(prev => [...prev, message]);
	}, []);

	const processNext = useCallback(() => {
		return actionQueue[0]; // Return next action without removing it
	}, [actionQueue]);

	const removeProcessed = useCallback(() => {
		setActionQueue(prev => prev.slice(1));
	}, []);

	return {
		actionQueue, setActionQueue, processingRef, addToQueue, processNext, removeProcessed
	};
}