let generatedQrFileName = "";
function generateStaffQr() {




    const staffId = normalizeQrValue(document.getElementById("staffQrId").value);
    const staffName = document.getElementById("staffQrName").value.trim();




    if (!staffName || !staffId) {
        updateQrGeneratorStatus("Isi nama dan Staff ID terlebih dahulu.", true);
        return;
    }




    generateQrCode(staffId, staffId + ".png");




}




function generateInventoryQr() {




    const sku = normalizeQrValue(document.getElementById("inventoryQrSku").value);
    const itemName = document.getElementById("inventoryQrName").value.trim();




    if (!itemName || !sku) {
        updateQrGeneratorStatus("Isi nama barang dan SKU terlebih dahulu.", true);
        return;
    }




    generateQrCode(sku, sku + ".png");




}




function generateQrCode(qrContent, fileName) {




    const qrPreviewCanvas = document.getElementById("qrPreviewCanvas");




    try {
        drawQrToCanvas(qrContent, qrPreviewCanvas, 1024);




        generatedQrFileName = sanitizeFileName(fileName);
        document.getElementById("qrPreviewLabel").textContent = qrContent;
        document.getElementById("qrPreviewPanel").hidden = false;
        updateQrGeneratorStatus("QR berhasil dibuat.");
    } catch (error) {
        updateQrGeneratorStatus(error.message || "QR belum bisa dibuat. Coba lagi.", true);
    }




}




// Local QR encoder for short Staff IDs and SKUs, so kiosk mode does not depend on a CDN.
function drawQrToCanvas(text, canvas, outputSize) {




    const qr = createQrMatrix(text);
    const context = canvas.getContext("2d");
    const quietZone = 4;
    const moduleCount = qr.length + quietZone * 2;
    const moduleSize = Math.floor(outputSize / moduleCount);
    const canvasSize = moduleSize * moduleCount;




    canvas.width = canvasSize;
    canvas.height = canvasSize;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvasSize, canvasSize);
    context.fillStyle = "#000000";




    for (let y = 0; y < qr.length; y += 1) {
        for (let x = 0; x < qr.length; x += 1) {
            if (qr[y][x]) {
                context.fillRect(
                    (x + quietZone) * moduleSize,
                    (y + quietZone) * moduleSize,
                    moduleSize,
                    moduleSize
                );
            }
        }
    }




}




function createQrMatrix(text) {




    const dataCodewords = createQrDataCodewords(text);
    const errorCodewords = createReedSolomonCodewords(dataCodewords, 16);
    const codewords = dataCodewords.concat(errorCodewords);
    const maskPattern = chooseQrMask(codewords);




    return buildQrMatrix(codewords, maskPattern);




}




function createQrDataCodewords(text) {




    const bytes = textToBytes(text);
    const maxDataBytes = 28;




    if (bytes.length > 25) {
        throw new Error("Kode terlalu panjang. Maksimal 25 karakter.");
    }




    const bits = [];
    appendBits(bits, 4, 4);
    appendBits(bits, bytes.length, 8);




    bytes.forEach(function(byte) {
        appendBits(bits, byte, 8);
    });




    appendBits(bits, 0, Math.min(4, maxDataBytes * 8 - bits.length));




    while (bits.length % 8 !== 0) {
        bits.push(0);
    }




    const dataCodewords = [];




    for (let index = 0; index < bits.length; index += 8) {
        dataCodewords.push(bitsToNumber(bits.slice(index, index + 8)));
    }




    let padByte = 0xEC;




    while (dataCodewords.length < maxDataBytes) {
        dataCodewords.push(padByte);
        padByte = padByte === 0xEC ? 0x11 : 0xEC;
    }




    return dataCodewords;




}




function buildQrMatrix(codewords, maskPattern) {




    const size = 25;
    const matrix = createEmptyMatrix(size);
    const reserved = createEmptyMatrix(size);




    addFinderPattern(matrix, reserved, 0, 0);
    addFinderPattern(matrix, reserved, size - 7, 0);
    addFinderPattern(matrix, reserved, 0, size - 7);
    addAlignmentPattern(matrix, reserved, 18, 18);
    addTimingPatterns(matrix, reserved);
    addDarkModule(matrix, reserved);
    reserveFormatAreas(reserved);
    addDataBits(matrix, reserved, codewords, maskPattern);
    addFormatBits(matrix, reserved, maskPattern);




    return matrix;




}




function chooseQrMask(codewords) {




    let bestMask = 0;
    let bestPenalty = Infinity;




    for (let mask = 0; mask < 8; mask += 1) {
        const matrix = buildQrMatrix(codewords, mask);
        const penalty = calculateQrPenalty(matrix);




        if (penalty < bestPenalty) {
            bestPenalty = penalty;
            bestMask = mask;
        }
    }




    return bestMask;




}




function addFinderPattern(matrix, reserved, left, top) {




    for (let y = -1; y <= 7; y += 1) {
        for (let x = -1; x <= 7; x += 1) {
            const row = top + y;
            const column = left + x;




            if (!isInsideMatrix(matrix, column, row)) {
                continue;
            }




            const isBorder = x === -1 || x === 7 || y === -1 || y === 7;
            const isFinder = !isBorder && (
                x === 0 || x === 6 || y === 0 || y === 6 ||
                (x >= 2 && x <= 4 && y >= 2 && y <= 4)
            );




            matrix[row][column] = isFinder;
            reserved[row][column] = true;
        }
    }




}




function addAlignmentPattern(matrix, reserved, centerX, centerY) {




    for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) {
            const row = centerY + y;
            const column = centerX + x;
            const isDark = Math.max(Math.abs(x), Math.abs(y)) !== 1;




            matrix[row][column] = isDark;
            reserved[row][column] = true;
        }
    }




}




function addTimingPatterns(matrix, reserved) {




    for (let index = 8; index < matrix.length - 8; index += 1) {
        const isDark = index % 2 === 0;
        matrix[6][index] = isDark;
        matrix[index][6] = isDark;
        reserved[6][index] = true;
        reserved[index][6] = true;
    }




}




function addDarkModule(matrix, reserved) {




    matrix[17][8] = true;
    reserved[17][8] = true;




}




function reserveFormatAreas(reserved) {




    const size = reserved.length;




    for (let index = 0; index <= 8; index += 1) {
        if (index !== 6) {
            reserved[8][index] = true;
            reserved[index][8] = true;
        }
    }




    for (let index = 0; index < 8; index += 1) {
        reserved[8][size - 1 - index] = true;
        reserved[size - 1 - index][8] = true;
    }




}




function addDataBits(matrix, reserved, codewords, maskPattern) {




    const bits = [];




    codewords.forEach(function(codeword) {
        appendBits(bits, codeword, 8);
    });




    let bitIndex = 0;
    let upward = true;




    for (let right = matrix.length - 1; right >= 1; right -= 2) {
        if (right === 6) {
            right -= 1;
        }




        for (let vertical = 0; vertical < matrix.length; vertical += 1) {
            const row = upward ? matrix.length - 1 - vertical : vertical;




            for (let offset = 0; offset < 2; offset += 1) {
                const column = right - offset;




                if (reserved[row][column]) {
                    continue;
                }




                let isDark = bitIndex < bits.length ? bits[bitIndex] === 1 : false;




                if (getMaskBit(maskPattern, row, column)) {
                    isDark = !isDark;
                }




                matrix[row][column] = isDark;
                bitIndex += 1;
            }
        }




        upward = !upward;
    }




}




function addFormatBits(matrix, reserved, maskPattern) {




    const size = matrix.length;
    const formatBits = getFormatBits(maskPattern);
    const firstPositions = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
        [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8],
        [2, 8], [1, 8], [0, 8]
    ];




    const secondPositions = [
        [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
        [size - 5, 8], [size - 6, 8], [size - 7, 8], [size - 8, 8],
        [8, size - 7], [8, size - 6], [8, size - 5],
        [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
    ];




    firstPositions.forEach(function(position, index) {
        matrix[position[1]][position[0]] = ((formatBits >> index) & 1) === 1;
        reserved[position[1]][position[0]] = true;
    });




    secondPositions.forEach(function(position, index) {
        matrix[position[1]][position[0]] = ((formatBits >> index) & 1) === 1;
        reserved[position[1]][position[0]] = true;
    });




}




function getFormatBits(maskPattern) {




    let data = maskPattern;
    let value = data << 10;
    const generator = 0x537;




    for (let bit = 14; bit >= 10; bit -= 1) {
        if (((value >> bit) & 1) !== 0) {
            value ^= generator << (bit - 10);
        }
    }




    return ((data << 10) | value) ^ 0x5412;




}




function createReedSolomonCodewords(dataCodewords, errorCodewordCount) {




    const generator = createReedSolomonGenerator(errorCodewordCount);
    const result = new Array(errorCodewordCount).fill(0);




    dataCodewords.forEach(function(dataCodeword) {
        const factor = dataCodeword ^ result.shift();
        result.push(0);




        generator.forEach(function(coefficient, index) {
            result[index] ^= gfMultiply(coefficient, factor);
        });
    });




    return result;




}




function createReedSolomonGenerator(degree) {




    let generator = [1];




    for (let index = 0; index < degree; index += 1) {
        generator = multiplyPolynomials(generator, [1, gfPow(2, index)]);
    }




    return generator.slice(1);




}




function multiplyPolynomials(left, right) {




    const result = new Array(left.length + right.length - 1).fill(0);




    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
        for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
            result[leftIndex + rightIndex] ^= gfMultiply(left[leftIndex], right[rightIndex]);
        }
    }




    return result;




}




function gfPow(value, power) {




    let result = 1;




    for (let index = 0; index < power; index += 1) {
        result = gfMultiply(result, value);
    }




    return result;




}




function gfMultiply(left, right) {




    let result = 0;
    let a = left;
    let b = right;




    while (b > 0) {
        if ((b & 1) !== 0) {
            result ^= a;
        }




        a <<= 1;




        if ((a & 0x100) !== 0) {
            a ^= 0x11D;
        }




        b >>= 1;
    }




    return result & 0xFF;




}




function getMaskBit(maskPattern, row, column) {




    if (maskPattern === 0) {
        return (row + column) % 2 === 0;
    }




    if (maskPattern === 1) {
        return row % 2 === 0;
    }




    if (maskPattern === 2) {
        return column % 3 === 0;
    }




    if (maskPattern === 3) {
        return (row + column) % 3 === 0;
    }




    if (maskPattern === 4) {
        return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    }




    if (maskPattern === 5) {
        return ((row * column) % 2) + ((row * column) % 3) === 0;
    }




    if (maskPattern === 6) {
        return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    }




    return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;




}




function calculateQrPenalty(matrix) {




    return calculateRunPenalty(matrix) +
        calculateBlockPenalty(matrix) +
        calculatePatternPenalty(matrix) +
        calculateBalancePenalty(matrix);




}




function calculateRunPenalty(matrix) {




    let penalty = 0;




    for (let y = 0; y < matrix.length; y += 1) {
        penalty += calculateLineRunPenalty(matrix[y]);
    }




    for (let x = 0; x < matrix.length; x += 1) {
        const column = matrix.map(function(row) {
            return row[x];
        });
        penalty += calculateLineRunPenalty(column);
    }




    return penalty;




}




function calculateLineRunPenalty(line) {




    let penalty = 0;
    let runColor = line[0];
    let runLength = 1;




    for (let index = 1; index < line.length; index += 1) {
        if (line[index] === runColor) {
            runLength += 1;
        } else {
            if (runLength >= 5) {
                penalty += runLength - 2;
            }




            runColor = line[index];
            runLength = 1;
        }
    }




    if (runLength >= 5) {
        penalty += runLength - 2;
    }




    return penalty;




}




function calculateBlockPenalty(matrix) {




    let penalty = 0;




    for (let y = 0; y < matrix.length - 1; y += 1) {
        for (let x = 0; x < matrix.length - 1; x += 1) {
            const color = matrix[y][x];




            if (
                matrix[y][x + 1] === color &&
                matrix[y + 1][x] === color &&
                matrix[y + 1][x + 1] === color
            ) {
                penalty += 3;
            }
        }
    }




    return penalty;




}




function calculatePatternPenalty(matrix) {




    let penalty = 0;




    for (let y = 0; y < matrix.length; y += 1) {
        penalty += calculateLinePatternPenalty(matrix[y]);
    }




    for (let x = 0; x < matrix.length; x += 1) {
        const column = matrix.map(function(row) {
            return row[x];
        });
        penalty += calculateLinePatternPenalty(column);
    }




    return penalty;




}




function calculateLinePatternPenalty(line) {




    let penalty = 0;
    const pattern = [true, false, true, true, true, false, true, false, false, false, false];




    for (let index = 0; index <= line.length - pattern.length; index += 1) {
        const matches = pattern.every(function(value, offset) {
            return line[index + offset] === value;
        });




        const reverseMatches = pattern.every(function(value, offset) {
            return line[index + offset] === pattern[pattern.length - 1 - offset];
        });




        if (matches || reverseMatches) {
            penalty += 40;
        }
    }




    return penalty;




}




function calculateBalancePenalty(matrix) {




    let darkCount = 0;
    const totalCount = matrix.length * matrix.length;




    matrix.forEach(function(row) {
        row.forEach(function(value) {
            if (value) {
                darkCount += 1;
            }
        });
    });




    const darkPercent = (darkCount * 100) / totalCount;
    const previousMultiple = Math.floor(darkPercent / 5) * 5;
    const nextMultiple = previousMultiple + 5;




    return Math.min(
        Math.abs(previousMultiple - 50) / 5,
        Math.abs(nextMultiple - 50) / 5
    ) * 10;




}




function textToBytes(text) {




    return text.split("").map(function(character) {
        const code = character.charCodeAt(0);




        if (code > 127) {
            throw new Error("Kode QR hanya boleh memakai huruf, angka, dan simbol standar.");
        }




        return code;
    });




}




function appendBits(bits, value, length) {




    for (let index = length - 1; index >= 0; index -= 1) {
        bits.push((value >> index) & 1);
    }




}




function bitsToNumber(bits) {




    return bits.reduce(function(value, bit) {
        return (value << 1) | bit;
    }, 0);




}




function createEmptyMatrix(size) {




    return Array.from({ length: size }, function() {
        return new Array(size).fill(false);
    });




}




function isInsideMatrix(matrix, column, row) {




    return row >= 0 && row < matrix.length && column >= 0 && column < matrix.length;




}




function downloadGeneratedQr() {




    const qrPreviewCanvas = document.getElementById("qrPreviewCanvas");




    if (!generatedQrFileName) {
        updateQrGeneratorStatus("Generate QR terlebih dahulu.", true);
        return;
    }




    const downloadLink = document.createElement("a");
    downloadLink.href = qrPreviewCanvas.toDataURL("image/png");
    downloadLink.download = generatedQrFileName;
    downloadLink.click();




}




function resetQrGeneratorResult() {




    generatedQrFileName = "";
    document.getElementById("qrGeneratorStatus").textContent = "";
    document.getElementById("qrGeneratorStatus").classList.remove("error");
    document.getElementById("qrPreviewPanel").hidden = true;
    document.getElementById("qrPreviewLabel").textContent = "";




}




function updateQrGeneratorStatus(message, isError) {




    const qrGeneratorStatus = document.getElementById("qrGeneratorStatus");




    qrGeneratorStatus.textContent = message;
    qrGeneratorStatus.classList.toggle("error", Boolean(isError));




}




function sanitizeFileName(fileName) {




    return fileName.replace(/[^a-z0-9._-]/gi, "_");




}




