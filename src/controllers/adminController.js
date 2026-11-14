import quotaNotifyQueue from "../queues/quotaNotifyQueue.js"
import usageFlushQueue from '../queues/usageFlushQueue.js'

const getQueueStatus = async(req, res) => {
    try {
        const [flushCounts, notifyCounts] = await Promise.all([
                usageFlushQueue.getJobCounts(),
                quotaNotifyQueue.getJobCounts()
        ]);

        res.json({
            'usage-flush': flushCounts,
            'quota-notify': notifyCounts
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'failed to fetch queue status'
        });
        
    }
};

export {getQueueStatus};