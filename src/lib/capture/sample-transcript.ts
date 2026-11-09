// A fictional talk written for this project (no real speaker's words), used by "Replay transcript" when the room is
// too loud for live captions or there is no microphone.
export const SAMPLE_TRANSCRIPT = {
  title: "Sample talk: Seeing your cluster with eBPF, without breaking it",
  lang: "en",
  text: `Thanks for coming, everyone. Today I want to talk about runtime security on Kubernetes, and why eBPF changed how we think about it.
For years, if you wanted to see what a container was really doing, you had two choices. You could add a sidecar to every pod, or you could load a kernel module and hope it didn't crash the node. Neither felt great at three in the morning.
eBPF gives us a third option. We load small, verified programs into the kernel, and they run when something interesting happens, like a process starting, a file opening, or a network connection being made.
The verifier is the important part. It checks every program before it runs, so a bug in your policy can't take down the host. That is a very different safety story from a kernel module.
Here is what we did on our platform team. First, we started in observe-only mode. We recorded every process execution and every outbound connection for two weeks, and we did not block anything.
Second, we turned those recordings into a baseline per workload. Most services talk to only three or four destinations, so the baseline is small and easy to review.
Third, we enforced the baseline in one namespace at a time, starting with the boring ones. Our payment services went last, not first.
The biggest lesson was about noise. Our first alert rules fired eight hundred times a day, and people stopped reading them within a week. We cut that down by alerting only on new behavior that also crossed a trust boundary, like a shell spawning inside a production container.
A few practical tips before we wrap up. Pin your kernel versions across node pools, because program support differs between kernels. Keep your policies in Git and review them like code. And measure overhead on a real workload, not a benchmark. We saw under two percent CPU, but your mileage will vary.
If you take one thing home today, start in observe-only mode, and earn the right to enforce. Thank you, and I'm happy to take questions.`,
};
