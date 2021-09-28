/**
 * An ID generator
 */
export class IdGenerator<T> {

    private ids = new Map<T, number>();

    private idSequence = 1;

    public getId(key: T) {
        if (!this.ids.has(key)) {
            this.ids.set(key, this.idSequence++);
        }
        return this.ids.get(key);
    }
}
