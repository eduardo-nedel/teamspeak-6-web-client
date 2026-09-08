export class ProjectionService {
    private state = { channels: [], participants: [], cursor: 0 };
    private status = 'READY';

    public applySnapshot(snapshot: any) {
        // Task 1.4: Stabilization Logic (Stub)
        this.status = 'RECONCILING';
        this.state = { ...snapshot };
        this.status = 'READY';
    }
    public getState() { return this.state; }
}
export const projectionService = new ProjectionService();
