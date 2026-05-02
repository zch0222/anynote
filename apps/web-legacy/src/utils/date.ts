import dayjs from "dayjs";
import {isNotNull} from "@/utils/objectUtil";

export default class DateTimeFormatter {
    static formatDate(inputTimeStr:any) {
        const inputDate = new Date(inputTimeStr);

        const month = String(inputDate.getMonth() + 1).padStart(2, '0'); // 月份从0开始，需要+1
        const day = String(inputDate.getDate()).padStart(2, '0');
        const hours = String(inputDate.getHours()).padStart(2, '0');
        const minutes = String(inputDate.getMinutes()).padStart(2, '0');

        return `${month}-${day} ${hours}:${minutes}`;
    }

    static formatDateStringToISO(originalDateString:any) {
        const originalDate = new Date(originalDateString);
        originalDate.setHours(originalDate.getHours() - 8);

        const year = originalDate.getFullYear();
        const month = (originalDate.getMonth() + 1).toString().padStart(2, '0');
        const day = originalDate.getDate().toString().padStart(2, '0');
        const hours = originalDate.getHours().toString().padStart(2, '0');
        const minutes = originalDate.getMinutes().toString().padStart(2, '0');
        const seconds = originalDate.getSeconds().toString().padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
    }
}

export function stringToDateString(date: string, format:string = "YYYY/MM/DD HH:mm:ss") {
    return dayjs(date).format(format)
}

export function getDateString(date: Date | undefined) {
    if (date) {
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
    }
    return ""
}

export function createDayjs(dateString: string | null | undefined): dayjs.Dayjs {
    if (isNotNull(dateString)) {
        return dayjs(dateString)
    }
    else {
        return dayjs()
    }
}
