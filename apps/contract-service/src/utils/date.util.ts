// format date thành YYYYMMDDHHmmss
export function formatDateYYYYMMDDHHmmss(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');

    return (
        date.getFullYear().toString() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds())
    );
}

export function getVNTime(): Date {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 7 * 60 * 60000);
}