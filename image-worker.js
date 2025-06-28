// image-worker.js

/**
 * 这是在后台线程中运行的脚本。
 * 它无法访问DOM，但可以执行密集的计算。
 */
self.onmessage = async (event) => {
    // 从主线程接收任务数据
    const { file, format, quality } = event.data;

    try {
        // 1. 将文件解码为图像位图（在工作线程中最高效的方式）
        const imageBitmap = await createImageBitmap(file);

        // 2. 创建一个离屏画布（OffscreenCanvas），它不显示在页面上
        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = canvas.getContext('2d');

        // 3. 在离屏画布上绘制图像
        ctx.drawImage(imageBitmap, 0, 0);

        // 4. 将画布内容转换为目标格式的Blob对象
        // canvas.convertToBlob 是一个异步操作，返回Promise
        const blob = await canvas.convertToBlob({
            type: format,
            quality: quality
        });
        
        // 5. 将处理结果（Blob和原始文件名）发送回主线程
        self.postMessage({
            status: 'success',
            blob: blob,
            name: file.name
        });

    } catch (error) {
        // 如果处理失败，向主线程发送错误信息
        self.postMessage({
            status: 'error',
            name: file.name,
            message: error.message
        });
    }
};