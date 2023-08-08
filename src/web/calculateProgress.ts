// プログレスバーとして出力する「#」の最大数
export const MAX_OUTPUT = 50;

/**
 * 解析された行数の割合から，プログレスの差分を計算する関数
 * @param {number} progressPercent
 * @param {number} numberOfProgress プログレス（更新前の「#」の数）
 * @return {number}
 */
export function calculateProgressDiff(
    progressPercent:number,
    numberOfProgress:number):number {
    // 現在の進度と、出力のバーの差を計算する
    let progressDiff = Math.floor(MAX_OUTPUT * progressPercent / 100) - numberOfProgress;

    // 出力できる最大数はMAX_OUTPUTなので，それを超えないように設定
    if (numberOfProgress + progressDiff > MAX_OUTPUT){
        progressDiff = MAX_OUTPUT - numberOfProgress;
    }
    return progressDiff;
}
