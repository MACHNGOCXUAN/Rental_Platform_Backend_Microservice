import { registerAs } from '@nestjs/config';
import { IRabbitMQConfig } from 'src/interfaces/config.interface';

export default registerAs('rabbitmq', (): IRabbitMQConfig => {
    const rabbitmqUrl = process.env.RABBITMQ_URL;
    const rabbitmqQueue = process.env.RABBITMQ_QUEUE;
    const rabbitmqPrefetch = process.env.RABBITMQ_PREFETCH;

    if (!rabbitmqUrl || !rabbitmqQueue) {
        throw new Error('Không có biến môi trường RABBITMQ_URL và RABBITMQ_QUEUE');
    }

    return {
        url: rabbitmqUrl,
        queue: rabbitmqQueue,
        prefetch: rabbitmqPrefetch ? parseInt(rabbitmqPrefetch, 10) : 10,
    };
});