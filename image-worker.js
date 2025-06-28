// image-worker.js (V3.5 - 内存优化版)

/**
 * 这是在后台线程中运行的脚本。
 * 它现在接收可转移的ArrayBuffer，而不是File对象，以实现极致的性能和内存效率。
 */
self.onmessage = async (event) => {
    // 从主线程接收任务数据
    // data 结构: { buffer: ArrayBuffer, type: string, name: string, format: string, quality: number }
    const { buffer, type, name, format, quality } = event.data;

    try {
        // 1. 将接收到的ArrayBuffer转换回Blob对象
        // Blob是createImageBitmap所需的数据类型
        const fileBlob = new Blob([buffer], { type: type });

        // 2. 将Blob解码为图像位图（在工作线程中最高效的方式）
        const imageBitmap = await createImageBitmap(fileBlob);

        // 3. 创建一个离屏画布（OffscreenCanvas），它不显示在页面上
        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('无法创建2D上下文。');
        }

        // 4. 在离屏画布上绘制图像
        ctx.drawImage(imageBitmap, 0, 0);

        // 5. 将画布内容转换为目标格式的Blob对象
        const resultBlob = await canvas.convertToBlob({
            type: format,
            quality: quality
        });
        
        // 6. 将处理结果（Blob和原始文件名）发送回主线程
        // 这里的数据量很小，普通传递即可
        self.postMessage({
            status: 'success',
            blob: resultBlob,
            name: name
        });

    } catch (error) {
        // 如果处理失败，向主线程发送错误信息
        self.postMessage({
            status: 'error',
            name: name,
            message: error.message
        });
    }
};